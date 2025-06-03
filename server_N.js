require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
//import { AzureOpenAI } from "openai";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });


const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const LLM_URL=process.env.LLM_URL;
const { wordsToNumbers } = require('words-to-numbers');


let audioChunks = [];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());


app.post('/think', async (req, res) => {
  try{
  
  console.log("Raw body:", req.body);
  const { model, temperature, messages } = req.body;

  const transcript = messages.slice().reverse().find(m => m.role === 'user')?.content;
  console.log("🧠 QNA Think Input:", transcript);

  let result;
  try {
    const fetchRes = await fetch("http://localhost:5001/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    result = await fetchRes.json();
  } catch (err) {
    console.error("Fetch error:", err);
    result = { answer: "Sorry, something went wrong." };
  }

  const fullResponse = result.answer || "Sorry, I don't know the answer to that yet.";
  const tokens = fullResponse.split(" ");
  const now = Math.floor(Date.now() / 1000);

  // Prepare headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Stream each token
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const chunk = {
      id: "chatcmpl-mock-" + now,
      object: "chat.completion.chunk",
      created: now,
      model: "gpt-4",
      choices: [
        {
          delta: { content: token + " " },
          index: 0,
          finish_reason: null
        }
      ]
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    await new Promise(resolve => setTimeout(resolve, 50)); // simulate delay
  }

  // Send the final [DONE] chunk
  const finalChunk = {
    id: "chatcmpl-mock-" + now,
    object: "chat.completion.chunk",
    created: now,
    model: "gpt-4",
    choices: [
      {
        delta: {},
        index: 0,
        finish_reason: "stop"
      }
    ]
  };
  console.log(`data: ${JSON.stringify(finalChunk)}\n\n`)
  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end(); 

}
catch(e)
{
  console.log(e)
}
});

// async function* generateResponse(req) {
//   console.log("Raw body:", req.body);
//   const { model, temperature, messages, stream, stream_options } = req.body;
//   const transcript = messages.slice().reverse().find(m => m.role === 'user')?.content;
//   console.log("🧠 QNA Think Input:", transcript);
//   const result = await fetch("http://localhost:5001/match", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ transcript }),
//           })
//   .then(res => res.json());
//   console.log(result)

//     const tokens = fullResponse.split(" ");
//     const text = result.answer || "Sorry, I don't know the answer to that yet.";
//     const fullResponse = [
//        text
//     ];

//     const now = Math.floor(Date.now() / 1000);

//     let i = 0;
//     for (const part of fullResponse) {
//         await new Promise(resolve => setTimeout(resolve, 1000)); // simulate delay
//         yield {
//             id: "chatcmpl-mock-" + now,
//             object: "chat.completion.chunk",
//             created: now,
//             model: "gpt-4",
//             choices: [
//                 {
//                     delta: { content: part },
//                     index: 0,
//                     finish_reason: null
//                 }
//             ]
//         };
//         i++;
//     }

//     // Finally, yield a termination chunk to mimic finish_reason
//     yield {
//         id: "chatcmpl-mock-" + now,
//         object: "chat.completion.chunk",
//         created: now,
//         model: "gpt-4",
//         choices: [
//             {
//                 delta: {},
//                 index: 0,
//                 finish_reason: "stop"
//             }
//         ]
//     };
// }

// module.exports = { generateResponse };


wss.on('connection', function connection(clientSocket) {
  console.log('🟢 Frontend WebSocket connected');
  let question = '';
  const deepgramSocket = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`
    }
  });

  deepgramSocket.on('open', () => {
    console.log('🔗 Connected to Deepgram');
    
    const settings = {
        type: "Settings",
        audio: {
          input: {
            encoding: "linear16",
            sample_rate: 48000
          },
          "output": {
              "encoding": "mp3",
               "sample_rate": 24000,
              // "container": "none"
            }
        },
        agent: {
          language: "en",
          listen: {
            provider: {
              type: "deepgram",
              model: "nova-2"
            }
          },
          speak: {
              provider: {
                type: 'deepgram',
                model: 'aura-2-thalia-en'
              }
            },
          think: {
              provider: {
                type: "open_ai",
                model: "gpt-4",
                temperature: 0.7
              },
              endpoint: { // Optional if LLM provider is Deepgram. Required for non-Deepgram LLM providers
                url: LLM_URL
                // headers": {
                //   "authorization": `Bearer {${}}`
                // }
              },
          // ... other settings ...
        },
        greeting: "Hello. Welcome to voice chat assistance" 

        }
      };
    deepgramSocket.send(JSON.stringify(settings));
  });
  const isJSON = (buffer) => {
    try {
      JSON.parse(buffer.toString());
      return true;
    } catch (e) {
      return false;
    }
  };
  deepgramSocket.on('message', async (msg) => {
    try {
      
      console.log(typeof msg);
     
      if (!isJSON(msg)) {
        //console.log('📨 Deepgram event raw:', msg);
       
        audioChunks.push(msg);
       
      }
      else
      {
         let parsed=''
        parsed = JSON.parse(msg);
        console.log('📨 Deepgram event parsed:', parsed);
        // USER spoke something
        if (parsed.type === 'ConversationText' && parsed.role === 'user') {
          //const question = parsed.content.toLowerCase().trim();
          question=question+ wordsToNumbers(parsed.content.toLowerCase().trim()) + ' ';
          console.log('🗣️ User said:', question);

          
        // ASSISTANT replied
        } 
        else if (
          parsed.type === 'ConversationText' && parsed.role === 'assistant' 
        ) 
        {

          // Send to frontend immediately
          clientSocket.send(JSON.stringify({
            type: 'QnA',
            question,
            answer: ''
          }));
          question=''
          const answer = parsed.content?.toLowerCase().trim() || '';
          console.log('🤖 Assistant replied:', answer);

          clientSocket.send(JSON.stringify({
            type: 'QnA',
            question: '',
            answer
          }));

          
        } 
        else if (parsed.type === 'Welcome') {
         
        }
        else if (
          parsed.type === 'AgentAudioDone')
        {
           if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
            const audioBuffer = Buffer.concat(audioChunks);
            clientSocket.send(audioBuffer);
            audioChunks=[];
          }
        }
      }
      
    } 
    
    catch (e) {
       //clientSocket.send(msg)
      //console.error('❌ Failed to parse Deepgram message:', e.message);
    }
  });
  deepgramSocket.on("error", (err) => {
    console.error("WebSocket Error:", err);
  });

  clientSocket.on('message', (msg) => {
    // If text (like "__welcome__"), you can optionally handle it here
    try{
    if (typeof msg === 'string') {
      console.log('📩 Received text message:', msg);
      return;
    }

    // 🟡 Possible failure points:
    // 1. If Deepgram isn't open, this will be skipped.
    // 2. If the mic didn't send binary data (Int16 buffer), this won't fire.
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      //console.log('📤 Forwarding audio to Deepgram:', msg.byteLength, 'bytes');
      deepgramSocket.send(msg);
    } else {
      //console.warn('⚠️ Deepgram socket not ready, audio not sent.');
    }
  }
  catch(e)
  {
    console.log(e)
  }
  });

  clientSocket.on('close', () => {
    console.log('🔴 Frontend WebSocket disconnected');
    if (deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.close();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
