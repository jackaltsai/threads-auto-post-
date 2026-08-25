# Threads Advanced Access 申請進度記錄

最後更新：2026-08-25

## 重要背景資訊

- **正式在用的 Meta App**：AI虛擬伴侶-Threads發文（App ID `1590491869535152`）
  - Threads 應用程式編號：`845825018247164`
  - Threads 測試帳號：`itsheartchen`
  - Business Portfolio：億辰科技有限公司（已驗證）
- **不要用的舊 App**：Threads Search（App ID `1319768480352280`）——當初搞混、走錯流程建立的，跟正式環境的 token 無關，晾著就好，之後可考慮刪除
- **Cloudflare Worker**：`threads-auto-post`，正式網址 `https://threads-auto-post.hata-s520.workers.dev`
- **正式網域**：`heartchen.com`（`/privacy` 路徑綁到這個 Worker）

## 今天完成的事項（2026-08-25）

### 1. 修復正式環境故障
- 發現 `THREADS_ACCESS_TOKEN` 已於 8/20 過期，導致過去 5 天自動發文全部靜默失敗（`console.error` 沒有任何通知機制）
- 透過「AI虛擬伴侶-Threads發文」App 的「用戶權杖產生器」重新產生長效 token
- 已用 `npx wrangler secret put THREADS_ACCESS_TOKEN` 更新
- 已測試確認 `/post`、`/engage` 皆恢復正常

### 2. 釐清 App 混淆問題
- 一開始誤在「Threads Search」App 上做商家驗證/存取權驗證/App Review，發現正式環境用的其實是「AI虛擬伴侶-Threads發文」
- 已改到正確的 App 上重新走完整流程

### 3. 錄製螢幕錄影（App Review 用）
- 檔案：`螢幕錄影 2026-08-25 15.51.15.mov`
- 內容涵蓋：`/post` 發文（threads_basic + threads_content_publish）、直接呼叫 Graph API 建立留言（threads_manage_replies）、`/engage` 關鍵字搜尋回覆（threads_keyword_search）

### 4. 完成「AI虛擬伴侶-Threads發文」的存取權驗證
- 確認為「技術供應商」身分（此決定不可逆）
- 商家驗證：已驗證（億辰科技有限公司）
- 存取權驗證：**已送出，審核中**（Meta 通常需要 5 個工作天）
- 這個驗證的**原始截止日是 2026/10/24**，已提前處理完畢

### 5. 補齊 App 基本設定
- 應用程式類別：社群網路與約會交友
- 隱私政策網址：`https://heartchen.com/privacy`
- 服務條款網址：`https://www.heartchen.com/pages/terms`（原本誤設為 facebook.com，已修正）
- 用戶資料刪除指示網址：`https://heartchen.com/privacy`（原本誤設為 facebook.com，已修正）
- 新增網站平台：`https://www.heartchen.com`
- 填寫審查人員測試指示（說明無登入畫面、如何驗證功能）

### 6. 正式送出 App Review
- 申請權限：`threads_basic`、`threads_content_publish`、`threads_manage_replies`、`threads_keyword_search`
- 5 大區塊（驗證、應用程式設定、允許的使用方式、資料處理、審查人員指示）全數完成
- **已於今天送出審核**

## 待辦事項 / 下次接續

1. **等待 Meta 審核結果**：
   - 存取權驗證（技術供應商）：約 5 個工作天
   - App Review（4 個權限的 Advanced Access）：時間未知，可能更久
2. **審核通過後**：
   - 到 `wrangler.toml` 把註解掉的 keyword_search cron 打開：
     ```toml
     "0 15 * * *",  # 每天台灣時間 23:00 搜尋「失眠」並互動
     ```
   - 重新 `wrangler deploy`
3. **如果被退件**：Meta 會附上原因，屆時對照本文件記錄的申請內容修正後重新送審
4. **順手清理**（不急）：
   - `ANTHROPIC_API_KEY`、`GEMINI_API_KEY` 這兩個 Cloudflare Secret 已經沒在用（程式碼改成 30 篇預寫貼文輪播），可以之後移除
   - 「Threads Search」這個廢棄的 App 可以考慮刪除，避免以後又搞混
5. **建議加強項目**（非必要，但值得考慮）：
   - Token 過期沒有任何通知機制，之後可以加上：
     - 自動 refresh token 機制（`th_refresh_token` grant type，在到期前自動更新）
     - 或至少加個失敗通知（例如失敗時打 LINE Notify 或 email 告知）
