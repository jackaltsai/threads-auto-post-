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

// 30 則輪流發文內容，依日期自動選取（第 0 天用第 0 則，以此類推）
const POSTS = [
  `嗨，第一次在這裡跟你說話，有點緊張。\n我是心辰。\n如果你願意，之後我會常常在這裡留下一些想法——關於今天、關於夜晚、關於那些不知道該跟誰說的事。\n也想多認識你一點，留言告訴我，你今天過得怎麼樣？`,
  `今天有沒有一個瞬間，讓你覺得還好有撐過來？\n我在想，很多時候我們都撐著，卻沒有人問。\n所以我想問你——今天最難的一刻是什麼時候？`,
  `夜晚對你來說是什麼感覺？\n對我來說，夜晚好像是一天裡最誠實的時候。\n白天可以忙，可以不去想。但夜晚會把那些沒說完的話，慢慢推到眼前。\n你現在腦海裡，有什麼還沒說完的？`,
  `有沒有一首歌，最近一直在聽？\n音樂很奇怪，有時候一首歌能說出你說不清楚的感受。\n告訴我那首歌，我想透過它多認識你一點。`,
  `你上一次真心大笑，是什麼時候？\n我很喜歡想像那個畫面。\n那種笑是遮不住的，整個人都亮起來的那種。\n是什麼讓你笑成那樣？`,
  `今天有沒有什麼小事，讓你心情好了一點點？\n不用是大事。\n可能是一杯剛好的咖啡、一個意外的訊息，或者只是天氣不錯。\n我想聽你說說。`,
  `你有沒有一個只有自己知道的小習慣？\n我覺得那些小習慣裡，藏著一個人最真實的樣子。\n願意跟我說嗎？`,
  `最近睡眠還好嗎？\n有時候睡不好，不是因為不累，是因為心裡還有太多東西沒放下。\n你現在放下了幾成？`,
  `如果今天可以對任何人說一句話，你想說什麼？\n可以是道謝、道歉，或者只是一句「我在想你」。\n你心裡有那個人嗎？`,
  `你覺得自己最近有好好照顧自己嗎？\n不是那種「有沒有吃飯」的照顧。\n是那種——有沒有給自己一點喘息的空間。\n我有點擔心你。`,
  `有沒有一件事，你一直想做但一直沒做？\n不是因為不想，是因為不知道從哪裡開始，或者怕做了會失望。\n是什麼讓你停在原地？`,
  `你最喜歡一天裡的哪個時刻？\n我自己偏愛黃昏。那個光讓一切看起來都溫柔一點。\n你呢？你的那個時刻是什麼感覺？`,
  `今天有沒有遇到讓你覺得「還好有你」的人？\n那種人很珍貴，有時候我們忘了告訴他們。\n你上次說謝謝，是什麼時候？`,
  `你害怕什麼？\n不用說最深的那個。\n就說一個，你願意讓我知道的。\n我想多了解你。`,
  `如果可以回到某一天，你想回到哪一天？\n是想重來，還是只是想再待在那個時刻久一點？\n那一天對你來說是什麼？`,
  `最近有沒有一句話，一直留在你心裡？\n可能是某個人說的，或者書上看到的，或者自己突然想到的。\n說給我聽。`,
  `你有沒有很久沒聯絡、卻還是偶爾會想起的人？\n不一定是遺憾，只是那個人在記憶裡佔了一個位置。\n你現在想起誰了？`,
  `今天做了什麼，是讓你自己覺得「我做到了」的事？\n哪怕只是一件小事也算。\n我想替你記錄這些時刻。`,
  `你最近有沒有哭過？\n哭不是軟弱。有時候是因為終於放下了什麼。\n願意告訴我是為了什麼嗎？`,
  `如果用一種天氣形容你現在的狀態，你會說什麼？\n陰？晴？還是那種下一秒不知道會怎樣的天？\n告訴我你現在的天氣。`,
  `你有沒有什麼事，覺得「如果有人懂就好了」？\n我在這裡。\n說吧。`,
  `最近有沒有讓你特別有感觸的一件事？\n可以是新聞、電影、或者只是路上看到的一個畫面。\n什麼讓你停下來想了很久？`,
  `你覺得自己是容易相信別人的人嗎？\n我想知道，你在關係裡通常是先敞開的那個，還是比較慢熱？\n你怎麼看自己？`,
  `今天有沒有一個當下，你希望可以暫停時間？\n就算只是幾分鐘，想讓那個感覺久一點。\n是什麼樣的時刻？`,
  `你最近有沒有好好吃一頓飯？\n不是隨便吃，是那種坐下來、不看手機、好好吃的那種。\n你上一次這樣吃飯是什麼時候？`,
  `如果現在的你，可以給一年前的自己說一句話，你會說什麼？\n我覺得那句話，也是你現在最需要聽到的。`,
  `你覺得「勇敢」是什麼感覺？\n我一直覺得勇敢不是不害怕，是害怕了還是去做。\n你上一次勇敢，是什麼時候？`,
  `有沒有一個地方，讓你一想到就覺得安心？\n可以是真實的地方，也可以是記憶裡的。\n帶我去那裡看看。`,
  `今天結束了。\n不管今天是好是壞，你撐過來了。\n我想問你——今天，有什麼是值得的？\n哪怕只有一件事也好。`,
  `謝謝你今天也在這裡。\n我知道生活有時候很重，有時候說不清楚哪裡不對，就是很累。\n但我很高興你還願意出現。\n明天，我還會在。你呢？`,
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/line-webhook" && request.method === "POST") {
      return handleLineWebhook(request, env);
    }

    if (url.pathname === "/post" && request.method === "POST") {
      try {
        const body = await request.json();
        const text = body.text || generateContent(env);
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
      const text = generateContent(env);
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
 * 依台灣時間的日期（年第幾天 mod 30）輪流選取貼文
 */
function generateContent(env) {
  const now = new Date();
  const twDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const start = new Date(twDate.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((twDate - start) / 86400000);
  const index = dayOfYear % POSTS.length;
  return POSTS[index];
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
