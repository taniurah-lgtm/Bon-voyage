# 2026-10-29 SNSドラフト（生成エラー）

```
全モデル失敗:
gemini-flash-latest/8192: 503 {
  "error": {
    "code": 503,
    "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    "status": "UNAVAILABLE"
  }
}

gemini-flash-latest/16384: 429 {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-a
gemini-2.0-flash/8192: 404 {
  "error": {
    "code": 404,
    "message": "This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.8-flash for the latest features and improvemen
gemini-2.0-flash/16384: 404 {
  "error": {
    "code": 404,
    "message": "This model models/gemini-2.0-flash is no longer available. Please update your code to use models/gemini-3.8-flash for the latest features and improvemen
gemini-flash-lite-latest/8192: 400 {
  "error": {
    "code": 400,
    "message": "Request contains an invalid argument.",
    "status": "INVALID_ARGUMENT"
  }
}

gemini-flash-lite-latest/8192(思考なし): 429 {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-a
gemini-flash-lite-latest/16384: 429 {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-a
gemini-2.5-flash-lite/8192: 404 {
  "error": {
    "code": 404,
    "message": "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest 
gemini-2.5-flash-lite/16384: 404 {
  "error": {
    "code": 404,
    "message": "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest 
```

モデル名が原因なら Actions Variables に GEMINI_MODEL を設定してください（例: gemini-1.5-flash）。
