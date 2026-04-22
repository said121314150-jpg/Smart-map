# Smart City AI Setup

This site now includes a secure OpenAI-powered chat assistant.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env`.
3. Put your OpenAI API key in `.env`.
4. Start the site:

```bash
npm start
```

5. Open `http://localhost:3000`.

## Notes

- The browser now sends chat requests to `/api/chat`.
- The OpenAI API key stays on the server in `server.js`.
- The default model is `gpt-5-mini`, and you can change it with `OPENAI_MODEL`.
