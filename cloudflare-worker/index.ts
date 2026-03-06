import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  BUCKET: R2Bucket;
  AUTH_KEY: string;
  PUBLIC_URL: string; // e.g., https://pub-xxx.r2.dev or your custom domain
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('/*', cors());

app.post('/upload', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== c.env.AUTH_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { image, fileName, contentType } = await c.req.json();

    if (!image || !fileName) {
      return c.json({ error: 'Missing image or fileName' }, 400);
    }

    // Remove data:image/png;base64, prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    await c.env.BUCKET.put(fileName, binaryData, {
      httpMetadata: { contentType: contentType || 'image/png' },
    });

    const url = `${c.env.PUBLIC_URL}/${fileName}`;

    return c.json({ url });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

app.get('/health', (c) => c.text('OK'));

export default app;
