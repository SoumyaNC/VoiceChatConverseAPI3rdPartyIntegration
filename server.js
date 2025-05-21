require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const pendingAnswers = new Map();
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
// Sample Q&A list
const qna = {
  "what are your opening hours": "We are open from 9 AM to 8 PM.",
  "how can i book a room": "You can book a room through our website or call us.",
  "do you offer airport pickup": "Yes, we provide airport pickup services upon request."
};

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/think', (req, res) => {
  const userInput = req.body.input?.text?.toLowerCase().trim() || "";
  console.log("Q:", userInput);

  const answer = qna[userInput] || "Sorry, I didn't understand that.";
  res.json({
    output: {
      text: answer
    }
  });
});

app.post('/answer/:id', async (req, res) => {
  const questionId = req.params.id;
  const answer = req.body.answer?.trim();

  if (!pendingAnswers.has(questionId)) {
    return res.status(404).json({ error: 'Invalid question ID' });
  }

  const { question, clientSocket } = pendingAnswers.get(questionId);
  pendingAnswers.delete(questionId); // Cleanup

  console.log(`✅ Received answer for ${questionId}: ${answer}`);
  
  // Send text back to browser
  clientSocket.send(JSON.stringify({
    type: 'QnA',
    question,
    answer,
    questionId
  }));

  // Convert answer to speech
  try {
    const ttsRes = await fetch(
      'https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: answer })
      }
    );
    const ttsAudio = await ttsRes.arrayBuffer();
    clientSocket.send(ttsAudio);
    console.log(`🔊 Sent TTS audio for question ID ${questionId}`);
    res.json({ status: 'OK' });
  } catch (err) {
    console.error('❌ TTS error:', err);
    res.status(500).json({ error: 'TTS failed' });
  }
});





wss.on('connection', function connection(clientSocket) {
  console.log('Frontend connected');


  




  const deepgramSocket = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`
    }
  });

  deepgramSocket.on('open', () => {
    console.log('Connected to Deepgram');
    const settings = {
      type: 'Settings',
      audio: {
        input: {
          encoding: 'linear16',
          sample_rate: 48000    
        }
        // output: {
        //   encoding: 'opus',
        //   sample_rate: 48000
        // }
      },
      agent: {
        language: "en",
        listen: { provider: { type: "deepgram", model: "nova-2" }},
      }
      // agent: {
      //   language: 'en',
      //   listen: {
      //     provider: {
      //       type: 'deepgram',
      //       model: 'nova-2'
      //     }
      //   },
      //   speak: {
      //     provider: {
      //       type: 'deepgram',
      //       model: 'aura-2-thalia-en'
      //     }
      //   },
      //   think: {
      //     provider: {
      //       type: 'custom',
      //       url: 'http://localhost:3000/think'
      //     }
      //     }
      // }
    };
    deepgramSocket.send(JSON.stringify(settings));
  });

  deepgramSocket.on('message', async(msg) => {
    try {
      const parsed = JSON.parse(msg);
      console.log('Deepgram event:', parsed);

    //   if (parsed.type === 'transcript') {
        
    //     const question = parsed.text.toLowerCase().trim();
    //     console.log('Transcription: ', question);
    //     const answer = qna[question] || "Sorry, I didn't understand that.";

    //     const reply = {
    //       type: 'Response',
    //       text: answer
    //     };

    //     deepgramSocket.send(JSON.stringify(reply));
    //   }
    if (parsed.type === 'ConversationText' && parsed.role === 'user') {
        const question = parsed.content.toLowerCase().trim();
        console.log('User Question: ', question);
        //const transcript=question

        // Generate a unique ID for this question
        const questionId = Date.now().toString() + Math.random().toString(36).substring(2, 8);

        // Store for later async response
        pendingAnswers.set(questionId, { question, clientSocket });
        // Optionally notify frontend that the question was received
        clientSocket.send(JSON.stringify({
          type: 'QnA_Pending',
          questionId,
          question,
          message: 'Processing your question...'
        }));

        console.log(`🟡 Waiting for external answer for ID: ${questionId}`);


        // const result = await fetch("http://localhost:5001/match", {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({ transcript }),
        // })
        // .then(res => res.json());
        // console.log(result)
        // const answer = result.answer || "Sorry, I don't know the answer to that yet.";
        //  // 🎯 Send both question and answer to frontend
        // clientSocket.send(JSON.stringify({
        //   type: 'QnA',
        //   question,
        //   answer
        // }));
        // try {
        //   const ttsRes = await fetch(
        //     'https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3',
        //     {
        //       method: 'POST',
        //       headers: {
        //         Authorization: `Token ${DEEPGRAM_API_KEY}`,
        //         'Content-Type': 'application/json'
        //       },
        //       // body: JSON.stringify({ text: answer })
        //       body: JSON.stringify({ text: answer })
        //     }
        //   );

        //   const ttsAudio = await ttsRes.arrayBuffer();
        //   clientSocket.send(ttsAudio);
        //   console.log('🔊 Sent TTS audio');
        // } 
        // catch (err) {
        //   //console.error('❌ TTS error:', err);
        // }



        // const answer = qna[question] || "Sorry, I didn't understand that.";
        // console.log('User answer: ', answer);
        // const reply = {
        //     type: 'Response',
        //     text: answer
        // };

        // deepgramSocket.send(JSON.stringify(reply));



    } 
    else if (parsed.type === 'ConversationText' && parsed.role === 'assistant' || parsed.type === 'AgentAudioDone' ) {
      //const answer = parsed.content.toLowerCase().trim();
    //  // TTS the answer
    //   try {
    //     const ttsRes = await fetch(
    //       'https://api.deepgram.com/v1/speak?model=aura-2-andromeda-en&encoding=mp3',
    //       {
    //         method: 'POST',
    //         headers: {
    //           Authorization: `Token ${DEEPGRAM_API_KEY}`,
    //           'Content-Type': 'application/json'
    //         },
    //         // body: JSON.stringify({ text: answer })
    //         body: JSON.stringify({ text: answer })
    //       }
    //     );

    //     const ttsAudio = await ttsRes.arrayBuffer();
    //     clientSocket.send(ttsAudio);
    //     console.log('🔊 Sent TTS audio');
    //   } catch (err) {
    //     //console.error('❌ TTS error:', err);
    //   }


    }
    else if (parsed.type === 'Welcome')
    {
        console.log('Hi Welcome')
              
          const welcomeText = "Hi! You are talking to the custom voice agent. I'm there to help.";
          clientSocket.send(JSON.stringify({
            type: 'QnA',
            question: '',
            answer: welcomeText,
            welcomeMsg : true
          }));

          try {
            const ttsRes = await fetch(
              'https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3',
              {
                method: 'POST',
                headers: {
                  Authorization: `Token ${DEEPGRAM_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: welcomeText })
              }
            );

            const ttsAudio = await ttsRes.arrayBuffer();
            clientSocket.send(ttsAudio);
            console.log('👋 Sent welcome message audio');
          } catch (err) {
            console.error('❌ TTS error on welcome message:', err);
          }
    }
    else if (parsed.type === 'Error' && parsed.code === 'CLIENT_MESSAGE_TIMEOUT')
    {
        console.log('Client Timeout')
              
          const welcomeText = "I think you are not online. Connect me anytime if you need any help";
          clientSocket.send(JSON.stringify({
            type: 'QnA',
            question: '',
            answer: welcomeText,
            welcomeMsg : true
          }));

          try {
            const ttsRes = await fetch(
              'https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3',
              {
                method: 'POST',
                headers: {
                  Authorization: `Token ${DEEPGRAM_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: welcomeText })
              }
            );

            const ttsAudio = await ttsRes.arrayBuffer();
            clientSocket.send(ttsAudio);
            console.log('👋 Sent welcome message audio');
          } catch (err) {
            console.error('❌ TTS error on welcome message:', err);
          }
    }
    else
    {
      //console.log('Deepgram event:', parsed);




    }
      //clientSocket.send(msg);
    } 
    catch (e) {
      //console.log(e)
      //clientSocket.send(msg); // send binary audio to frontend
    }
  });


  clientSocket.on('message', (audio) => {
    //console.log('Received audio from frontend:', audio.byteLength); // Add this
    if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(audio);
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
  console.log(`Server running on port ${PORT}`);
});
