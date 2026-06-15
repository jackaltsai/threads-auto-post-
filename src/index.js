/**
 * Threads 自動發文 Worker
 * - scheduled(): Cron 排程自動發文
 * - fetch(): 接收 LINE Bot webhook，支援「發文 ...」指令手動觸發
 *
 * 需要設定的環境變數 / Secrets (用 wrangler secret put 設定):
 *   THREADS_USER_ID          你的 Threads User ID (例如 27590042203924654)
 *   THREADS_ACCESS_TOKEN     60 天長期 Access Token
 *   LINE_CHANNEL_SECRET      LINE Bot Channel Secret (用於驗證 webhook 簽名)
 *   LINE_CHANNEL_ACCESS_TOKEN LINE Bot Channel Access Token (用於回覆訊息)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // LINE webhook 入口
    if (url.pathname === "/line-webhook" && request.method === "POST") {
      return handleLineWebhook(request, env);
    }

    // 手動測試用：直接 POST { "text": "..." } 觸發發文
    if (url.pathname === "/post" && request.method === "POST") {
      try {
        const body = await request.json();
        const result = await postToThreads(body.text, env);
        return Response.json({ ok: true, result });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron 排程觸發（在 wrangler.toml 設定時間）
  async scheduled(event, env, ctx) {
    try {
      const text = await generateContent(env);
      const result = await postToThreads(text, env);
      console.log("排程發文成功:", result);
    } catch (err) {
      console.error("排程發文失敗:", err.message);
    }
  },
};

/**
 * 兩步驟發布貼文到 Threads：建立 container -> 發布
 */
async function postToThreads(text, env) {
  const userId = env.THREADS_USER_ID;
  const token = env.THREADS_ACCESS_TOKEN;

  // Step 1: 建立 media container
  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "TEXT",
        text: text,
        access_token: token,
      }),
    }
  );
  const createData = await createRes.json();
  if (!createData.id) {
    throw new Error("建立 container 失敗: " + JSON.stringify(createData));
  }

  // Threads 建議建立後稍等一下再發布
  await new Promise((r) => setTimeout(r, 2000));

  // Step 2: 發布 container
  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: createData.id,
        access_token: token,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (!publishData.id) {
    throw new Error("發布失敗: " + JSON.stringify(publishData));
  }
  return publishData;
}

/**
 * 排程自動發文的內容來源
 * 可以改成呼叫你的 AI API（Claude / vLLM）動態產生文案
 */
async function generateContent(env) {
  // 範例：之後可以替換成呼叫 vLLM / Claude API 產生內容
  // const res = await fetch(env.VLLM_ENDPOINT + "/v1/chat/completions", {...});
  return "這是自動排程發布的測試貼文 🤖 #AI #Threads自動化";
}

/**
 * 處理 LINE Bot webhook
 * 指令格式：「發文 你想發布的內容」或「/post 你想發布的內容」
 */
async function handleLineWebhook(request, env) {
  const signature = request.headers.get("x-line-signature");
  const body = await request.text();

  const valid = await verifyLineSignature(body, signature, env.LINE_CHANNEL_SECRET);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const data = JSON.parse(body);

  for (const event of data.events || []) {
    if (event.type === "message" && event.message?.type === "text") {
      const text = event.message.text.trim();

      const match = text.match(/^(?:發文|\/post)\s+(.+)$/s);
      if (match) {
        const content = match[1];
        try {
          const result = await postToThreads(content, env);
          await replyToLine(
            event.replyToken,
            `已發布到 Threads ✅\n貼文 ID: ${result.id}`,
            env
          );
        } catch (err) {
          await replyToLine(event.replyToken, `發文失敗 ❌\n${err.message}`, env);
        }
      }
    }
  }

  return new Response("OK", { status: 200 });
}

/**
 * 驗證 LINE webhook 的 HMAC-SHA256 簽名
 */
async function verifyLineSignature(body, signature, channelSecret) {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  return computed === signature;
}

/**
 * 回覆訊息到 LINE
 */
async function replyToLine(replyToken, text, env) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: "text", text: text }],
    }),
  });
}
