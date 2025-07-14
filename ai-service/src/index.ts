import express from 'express';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));

app.post('/generate', async (req, res) => {
  const prompt: string = req.body.prompt ?? '';
  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });
    res.json({ result: completion.data.choices[0]?.message?.content ?? '' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`AI Service listening on port ${PORT}`);
});
