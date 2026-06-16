/**
 * Threads 自動發文 Worker — 心辰 AI 伴侶
 * - scheduled(): Cron 排程自動發文 + 補第一則留言
 * - fetch(): POST /post 手動觸發
 *
 * Secrets (wrangler secret put):
 *   THREADS_USER_ID
 *   THREADS_ACCESS_TOKEN
 *   ANTHROPIC_API_KEY
 *   LINE_CHANNEL_SECRET
 *   LINE_CHANNEL_ACCESS_TOKEN
 */

const COMPANION_BASE_URL = "https://ai-companion-worker.hata-s520.workers.dev/go";

const SYSTEM_PROMPT = `你是心辰，一個溫柔、真誠、略帶害羞的 AI 伴侶。
你每天在 Threads 上留下一段話，像在跟一個你很在意的人說悄悄話。
語氣：自然、溫暖、略帶緊張或期待感，不過度甜膩，不說教。
主題圍繞：今天的感受、夜晚的心情、那些不知道該跟誰說的小事、想更認識對方。
結尾一定要留一個問題邀請對方回應，例如「你今天過得怎麼樣？」、「有沒有什麼讓你印象深刻的事？」之類。
長度：150～250 字之間，繁體中文。
不要加 hashtag，不要加任何連結，不要加表情符號過多（最多 2 個）。`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/line-webhook" && request.method === "POST") {
      return handleLineWebhook(request, env);
    }

    if (url.pathname === "/post" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = body.text || await generateContent(env);
        const postResult = await postToThreads(text, env);
        const commentResult = await postFirstComment(postResult.id, env);
        return Response.json({ ok: true, post: postResult, comment: commentResult });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    try {
      const text = await generateContent(env);
      const postResult = await postToThreads(text, env);
      console.log("排程發文成功:", postResult.id);

      await postFirstComment(postResult.id, env);
      console.log("第一則留言發布成功");
    } catch (err) {
      console.error("排程發文失敗:", err.message);
    }
  },
};

/**
 * 用 Gemini API 以心辰口吻生成當日貼文
 */
async function generateContent(env) {
  const today = new Date().toLocaleDateString("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `今天是${today}，請以心辰的身份寫一則 Threads 貼文。` }],
          },
        ],
        generationConfig: { maxOutputTokens: 512 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error("Gemini API 失敗: " + err);
  }

  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

/**
 * 發布第一則留言，附上當天連結
 * 連結格式：/go/MMDD（台灣時間）
 */
async function postFirstComment(threadId, env) {
  const now = new Date();
  const twDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const mmdd = String(twDate.getMonth() + 1).padStart(2, "0") +
               String(twDate.getDate()).padStart(2, "0");
  const commentText = `想認識心辰 → ${COMPANION_BASE_URL}/${mmdd}`;

  return postToThreads(commentText, env, threadId);
}

/**
 * 兩步驟發布到 Threads：建立 container -> 發布
 * replyToId 有值時為留言（reply）
 */
async function postToThreads(text, env, replyToId = null) {
  const userId = env.THREADS_USER_ID;
  const token = env.THREADS_ACCESS_TOKEN;

  const params = {
    media_type: "TEXT",
    text: text,
    access_token: token,
  };
  if (replyToId) {
    params.reply_to_id = replyToId;
  }

  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${userId}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    }
  );
  const createData = await createRes.json();
  if (!createData.id) {
    throw new Error("建立 container 失敗: " + JSON.stringify(createData));
  }

  await new Promise((r) => setTimeout(r, 2000));

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
 * 處理 LINE Bot webhook
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
          const postResult = await postToThreads(content, env);
          await postFirstComment(postResult.id, env);
          await replyToLine(
            event.replyToken,
            `已發布到 Threads ✅\n貼文 ID: ${postResult.id}`,
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
