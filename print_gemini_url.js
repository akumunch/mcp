import { geminiConfig } from './dist/config.js';

const apiVersion = 'v1beta2';
const model = geminiConfig.model;
const apiKey = geminiConfig.apiKey;
const encodedModel = encodeURIComponent(model);
const encodedKey = encodeURIComponent(apiKey);
const fullUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${encodedModel}:generate?key=${encodedKey}`;
const endpointPath = `/${apiVersion}/models/${encodedModel}:generate`;

console.log('FULL_REQUEST_URL:', fullUrl);
console.log('API_VERSION:', apiVersion);
console.log('MODEL:', model);
console.log('ENDPOINT_PATH:', endpointPath);
console.log('ENV GEMINI_MODEL_NAME:', process.env.GEMINI_MODEL_NAME ?? '<not set>');
console.log('ENV GEMINI_MODEL:', process.env.GEMINI_MODEL ?? '<not set>');
console.log('GEMINI_API_KEY length:', apiKey ? apiKey.length : 0);
