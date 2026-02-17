import OpenAI from 'openai';
import { config } from '../config';

export const ai = new OpenAI({
  apiKey: config.minimax.apiKey,
  baseURL: config.minimax.baseUrl,
});

export const MODEL = config.minimax.model;
