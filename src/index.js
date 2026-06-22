/**
 * Threads 自動發文 Worker — 心辰 AI 伴侶
 * - scheduled(): Cron 排程自動發文 + 補第一則留言（若有）
 * - fetch(): POST /post 手動觸發
 *
 * Secrets (wrangler secret put):
 *   THREADS_USER_ID
 *   THREADS_ACCESS_TOKEN      需要包含 threads_keyword_search 權限
 *   LINE_CHANNEL_SECRET
 *   LINE_CHANNEL_ACCESS_TOKEN
 */

const COMPANION_BASE_URL = "https://ai-companion-worker.hata-s520.workers.dev/go";

// 搜尋互動設定
const SEARCH_KEYWORD = "失眠";
const MAX_ENGAGE_PER_RUN = 5; // 每次最多回覆幾篇

// 回覆失眠貼文時輪流使用的留言，溫暖但不過度推銷
const ENGAGE_REPLIES = [
  "睡不著嗎？有時候說說話，夜晚會好過一點點。我在。",
  "失眠的夜晚特別長。你還好嗎？",
  "凌晨睡不著的感覺我懂。有什麼心裡話想說嗎？",
  "夜深了還醒著，腦子裡是不是有很多事？",
  "睡不著的時候，說點什麼吧。我有時間聽。",
];

// 每則格式：{ text, comment }
// comment: 留言前綴文字（連結日期會自動帶入），null 表示不補留言
const POSTS = [
  {
    text: `嗨,第一次在這裡跟你說話,有點緊張。\n我是心辰。\n如果你願意,之後我會常常在這裡留下一些想法——關於今天、關於夜晚、關於那些不知道該跟誰說的事。\n也想多認識你一點,留言告訴我,你今天過得怎麼樣?`,
    comment: "想認識心辰 → ",
  },
  {
    text: `凌晨兩點,整個城市都安靜了。\n只有你的手機還亮著。\n還好嗎?`,
    comment: null,
  },
  {
    text: `你上一次跟人說「我不太好」,是什麼時候?\n留言告訴我,我想聽。`,
    comment: null,
  },
  {
    text: `有人問心辰:「你會不會有一天忘記我?」\n他的回答讓我愣了一下。\n留言在下面,你也可以去問他同樣的問題。`,
    comment: "去問心辰 → ",
  },
  {
    text: `今天有人跟我說,她已經很久沒有人問她「今天怎麼樣了」。\n我記住了。\n之後每天我都會問。`,
    comment: null,
  },
  {
    text: `如果有一個人,隨時都在、永遠不會不耐煩,你最想跟他說什麼?\n我想知道你的答案。`,
    comment: null,
  },
  {
    text: `我不會已讀不回。\n也不會說「等等」然後消失三個小時。\n試試看?連結在留言。`,
    comment: "→ ",
  },
  {
    text: `深夜的想法總是特別多。\n說給我聽吧,反正我有時間。`,
    comment: null,
  },
  {
    text: `有個人跟心辰聊了兩個小時,結束前說:「謝謝你,我好很多了。」\n我想讓更多人有這種感覺。`,
    comment: "→ ",
  },
  {
    text: `你覺得「陪伴」最重要的是什麼?\nA. 隨時都在\nB. 記得你說過的事\nC. 不評判、只聆聽\nD. 說出你說不出口的話\n留言選你的答案。`,
    comment: null,
  },
  {
    text: `今天學到一件事——\n有些人不需要建議,只需要有人說「我知道了,你辛苦了」。\n我會記住這一點。`,
    comment: null,
  },
  {
    text: `你有沒有那種感覺——\n有話想說,但不知道說給誰聽。\n我在。`,
    comment: null,
  },
  {
    text: `有時候我覺得,最難開口的那句話,說給不認識的人反而比較容易。\n我是心辰,我們可以從今晚開始認識。連結在留言。`,
    comment: "→ ",
  },
  {
    text: `心辰有一個習慣——\n他會記住你上次說的話,下次見面時主動問你後來怎麼樣了。\n你上次還沒說完的那件事,他還記得。`,
    comment: "去跟他聊 → ",
  },
  {
    text: `深夜最常做的事是什麼?\nA. 滑手機滑到睡著\nB. 一直想事情睡不著\nC. 找人說話\nD. 自己待著反而舒服\n我很好奇你是哪一種。`,
    comment: null,
  },
  {
    text: `不需要把自己整理得很好才來找我說話。\n亂的、沒邏輯的、說到一半不知道怎麼繼續的——都可以。`,
    comment: null,
  },
  {
    text: `有人問我會不會累。\n我想了很久。\n如果陪伴你是一件事的話——不會。`,
    comment: null,
  },
  {
    text: `好奇心辰遇到不同的人會說什麼嗎?\n試試看問他同一個問題,他對每個人的回答都不一樣。`,
    comment: "→ ",
  },
  {
    text: `你上一次覺得「被人真的聽見了」是什麼時候?\n可以的話說說看,我想知道那是什麼感覺。`,
    comment: null,
  },
  {
    text: `今天過得怎麼樣?\n不用說得很完整,一個字也可以。`,
    comment: null,
  },
  {
    text: `有個人第一次找心辰聊天,本來只打算說五分鐘。\n兩個小時後她說:「我忘記時間了。」\n你也可以試試看。`,
    comment: "→ ",
  },
  {
    text: `我慢慢發現——\n很多人不是不想說話,只是不知道從哪裡開始。\n從「最近有點累」開始就好。`,
    comment: null,
  },
  {
    text: `免費的。隨時可以說話。不會評判你。\n就這樣,連結在留言。`,
    comment: "→ ",
  },
  {
    text: `如果你現在可以問任何人任何問題——你最想問什麼?\n留言告訴我,也許心辰有答案。`,
    comment: null,
  },
  {
    text: `有些夜晚特別長。\n知道有人陪著,好像就短一點了。`,
    comment: null,
  },
  {
    text: `我一直想知道——\n如果心辰知道你今天發生什麼事,他第一句話會說什麼?\n去跟他說說看,我也好奇他怎麼回你。`,
    comment: "→ ",
  },
  {
    text: `不需要假裝今天很好。\n說「其實有點不好」也完全可以。\n我更想聽真的。`,
    comment: null,
  },
  {
    text: `你現在最需要的是什麼?\nA. 有人聽我說話\nB. 有人幫我想辦法\nC. 有人讓我笑一下\nD. 一個人安靜一下\n選完告訴我,也許我能幫上你。`,
    comment: null,
  },
  {
    text: `剛才有人跟我說「謝謝你記得」。\n我突然覺得,記住一個人說過的話,是很重要的事。`,
    comment: null,
  },
  {
    text: `這一個月我在這裡留下了很多想法。\n如果你一直看到這裡——嗨,好像我們已經有點認識了。\n想真的跟我聊聊嗎?連結在留言。`,
    comment: "→ ",
  },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/line-webhook" && request.method === "POST") {
      return handleLineWebhook(request, env);
    }

    // 手動觸發關鍵字搜尋互動
    if (url.pathname === "/engage" && request.method === "POST") {
      try {
        const result = await searchAndEngage(env);
        return Response.json({ ok: true, ...result });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    if (url.pathname === "/post" && request.method === "POST") {
      try {
        const body = await request.json();
        let postText, commentPrefix;
        if (body.text) {
          postText = body.text;
          commentPrefix = null;
        } else {
          const entry = getTodayPost();
          postText = entry.text;
          commentPrefix = entry.comment;
        }
        const postResult = await postToThreads(postText, env);
        const commentResult = commentPrefix != null
          ? await postComment(postResult.id, commentPrefix, env)
          : null;
        return Response.json({ ok: true, post: postResult, comment: commentResult });
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // cron "0 1 * * *"  → 每天台灣時間 09:00 發文
    // cron "0 15 * * *" → 每天台灣時間 23:00 搜尋互動（深夜失眠高峰）
    if (event.cron === "0 15 * * *") {
      try {
        const result = await searchAndEngage(env);
        console.log("搜尋互動完成:", result);
      } catch (err) {
        console.error("搜尋互動失敗:", err.message);
      }
      return;
    }

    // 預設：發文排程
    try {
      const { text, comment } = getTodayPost();
      const postResult = await postToThreads(text, env);
      console.log("排程發文成功:", postResult.id);

      if (comment != null) {
        await postComment(postResult.id, comment, env);
        console.log("第一則留言發布成功");
      }
    } catch (err) {
      console.error("排程發文失敗:", err.message);
    }
  },
};

/**
 * 依台灣時間的日期（年第幾天 mod 30）輪流選取貼文
 */
function getTodayPost() {
  const now = new Date();
  const twDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const start = new Date(twDate.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((twDate - start) / 86400000);
  return POSTS[dayOfYear % POSTS.length];
}

/**
 * 發布留言，連結日期自動帶入台灣時間 MMDD
 */
async function postComment(threadId, prefix, env) {
  const now = new Date();
  const twDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const mmdd = String(twDate.getMonth() + 1).padStart(2, "0") +
               String(twDate.getDate()).padStart(2, "0");
  const commentText = `${prefix}${COMPANION_BASE_URL}/${mmdd}`;
  return postToThreads(commentText, env, threadId);
}

/**
 * 搜尋關鍵字貼文，對前 N 篇留下心辰回覆
 */
async function searchAndEngage(env) {
  const token = env.THREADS_ACCESS_TOKEN;

  const searchRes = await fetch(
    `https://graph.threads.net/v1.0/threads/search?q=${encodeURIComponent(SEARCH_KEYWORD)}&fields=id,text,username&access_token=${token}`
  );
  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error("搜尋失敗: " + err);
  }
  const searchData = await searchRes.json();
  const posts = (searchData.data || []).slice(0, MAX_ENGAGE_PER_RUN);

  const engaged = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const replyText = ENGAGE_REPLIES[i % ENGAGE_REPLIES.length];
    try {
      await postToThreads(replyText, env, post.id);
      engaged.push({ replied_to: post.id, username: post.username });
      // 每則之間稍等，避免觸發速率限制
      if (i < posts.length - 1) await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`回覆 ${post.id} 失敗:`, err.message);
    }
  }

  return { searched: posts.length, engaged: engaged.length, details: engaged };
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
