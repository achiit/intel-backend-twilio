const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const request = require('request');
const https = require('https');
const dotenv = require('dotenv');  // Import dotenv package
dotenv.config();
const { Readable } = require('stream');
const { promisify } = require('util');
const axios = require('axios');
const speech = require('@google-cloud/speech');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { Sequelize } = require("sequelize");
const app = express();
const twilio = require('twilio');
const openAI = require('openai');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json()); // Parse JSON bodies
app.use(cors());
const fs = require('fs');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const openaiApiKey = process.env.OPENAI_API_KEY;
const client = new twilio.Twilio(accountSid, authToken);
const port = process.env.PORT || 3000;
app.use(express.json());

let name, orderID, issue, priorityLevels;
const sequelize = new Sequelize('postgres://calllist_qi2u_user:NJC1fZt2oFmNovW2lKVnPi2XbBtMzMZO@dpg-co6f0ool6cac73a7t7rg-a.oregon-postgres.render.com/calllist_qi2u', {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

sequelize
  .sync()
  .then(() => {
    console.log("Database connected");
  })
  .catch((err) => {
    console.log(err);
    console.log("Unable to connect to the database");
  });

function handleTwilioCall(req, res) {
  const twiml = new VoiceResponse();

  twiml.say('Welcome to our customer care. Please provide your name, orderId, and the issue you are facing.');

  // twiml.gather({
  //   input: 'speech',
  //   timeout: 3,
  //   action: '/handle-response',
  //   method: 'POST',
  // });
  twiml.record({
    action: '/handle-recording',
    transcribe: true,
    transcribeCallback: '/transcript',
  });


  res.type('text/xml');
  res.send(twiml.toString());
}

async function handleJsonData(req, res) {
  // const { SpeechResult } = req.body;
  // const name = SpeechResult.name;
  // const orderId = SpeechResult.orderId;
  // const issue = SpeechResult.issue;

  // Perform NLP and ML analysis here to determine priority

  // Simulate urgency check
  // Replace with your urgency determination logic

  const openai = new openAI({
    apiKey: openaiApiKey,
  });

  async function checkPriority() {
    console.log('Checking priority...');
    const apiUrl = 'https://priority-predicter.onrender.com/predict_priority';

    const requestBody = {
      issue: issue
    };

    try {
      const response = await axios.post(apiUrl, requestBody);
      const priorityLevel = response.data.predicted_priority;

      console.log(priorityLevel);
      priorityLevels = priorityLevel;
      return priorityLevel;
    } catch (error) {
      console.error("Error:", error.message);
      throw error;
    }
  }



  async function priority() {
    try {
      const p = await checkPriority();




      // Continue with the rest of your code...


      const CustomerCare = sequelize.define('customer_care', {
        name: Sequelize.STRING,
        order_id: Sequelize.STRING,
        issue: Sequelize.STRING,
        priority: Sequelize.STRING,
      });

      CustomerCare.sync()
        .then(() => {
          console.log('CustomerCare table created (if not existed)');
        })
        .catch((error) => {
          console.error('Error creating CustomerCare table:', error);
        });

      await CustomerCare.create({ name, order_id: orderID, issue, priority: priorityLevels });
      console.log('Data inserted into PostgreSQL');


      // Send the response
      res.status(200).json({ message: 'Request processed successfully' });

    } catch (error) {
      console.error("Error:", error.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  // Call the priority function
  await priority();
}
const openai = new openAI({
  apiKey: openaiApiKey,
});
async function speechToText(recordingFilePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(recordingFilePath),
      model: "whisper-1",
    });

    const transcriptionText = transcription.text;
    console.log('Transcription Text:', transcriptionText);

    // Regular expressions to capture name, order ID, and issue
    const nameRegex = /My name is\s+([^.,]+)/i;
    const orderIDRegex = /order\s+ID\s+is\s+(\d{5})/i;
    const issueRegex = /I have\s+(.+?)(\.|$)/i;

    // Extract information using regular expressions
    const nameMatch = transcriptionText.match(nameRegex);
    const orderIDMatch = transcriptionText.match(orderIDRegex);
    const issueMatch = transcriptionText.match(issueRegex);

    // Extracted information
    name = nameMatch ? nameMatch[1].trim() : null;
    orderID = orderIDMatch ? orderIDMatch[1] : null;
    issue = issueMatch ? issueMatch[1].trim() : null;

    // Checking if all required information is present
    if (name && orderID && issue) {
      console.log('Name:', name);
      console.log('Order ID:', orderID);
      console.log('Issue:', issue);
    } else {
      console.log('Unable to extract required information from the transcription.');
      const gptResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { "role": "system", "content": "You are a helpful assistant." },
          { "role": "user", "content": `Extract the name, order ID, and issue from the transcription: ${transcriptionText}` }
        ]
      });


      const gptExtractedInfo = gptResponse.choices[0].message.content;
      console.log('GPT-3 Extracted Information:', gptExtractedInfo);

      // Split the extracted information by newline character
      const gptInfoArray = gptExtractedInfo.split('\n');

      // Extract information using regular expressions
      name = gptInfoArray.find(info => info.includes('Name:'))?.replace('Name:', '').trim();
      orderID = gptInfoArray.find(info => info.includes('Order ID:'))?.replace('Order ID:', '').trim();
      issue = gptInfoArray.find(info => info.includes('Issue:'))?.replace('Issue:', '').trim();


      console.log('Name (GPT-3):', name);
      console.log('Order ID (GPT-3):', orderID);
      console.log('Issue (GPT-3):', issue);
    }

    // Call handleJsonData after extracting information
    await handleJsonData();

  } catch (error) {
    console.error("Error during transcription:", error.message);
  }
}
const recordingFilePath = '1.wav'; // Replace with the correct file path
speechToText(recordingFilePath);
async function handleRecording(req, res) {
  console.log('Received recording callback:', req.body);

  // Extract recording URL from the callback
  const recordingUrl = req.body.RecordingUrl;
  const recordingLength = req.body.RecordingDuration;

  // Process the recording URL as needed (e.g., download the audio file)
  console.log('Recording URL:', recordingUrl);
  console.log('Recording duration:', recordingLength);
  downloadRecording(accountSid, authToken, recordingUrl, "1.wav");

  // Add your code to handle the recording URL, such as downloading or processing the audio file

  res.status(200).end(); // Respond to the Twilio callback with a 200 status
}

// async function handleRecording(req, res) {
//   console.log('Received recording callback:', req.body);

//   // Extract recording URL from the callback
//   const recordingUrl = req.body.RecordingUrl;
//   const recordingLength = req.body.RecordingDuration;

//   // Process the recording URL as needed (e.g., download the audio file)
//   console.log('Recording URL:', recordingUrl);
//   console.log('Recording duration:', recordingLength);
//   downloadRecording(accountSid, authToken, recordingUrl, "1.wav");

//   // Set the status to false for the newly created recording
//   const status = false;

//   try {
//     console.log("starting the handle recording")
//     // Define the CustomerCare model
//     const CustomerCare = sequelize.define('customer_care', {
//       name: Sequelize.STRING,
//       order_id: Sequelize.STRING,
//       issue: Sequelize.STRING,
//       priority: Sequelize.STRING,
//       solved: Sequelize.BOOLEAN // Add status column to the model
//     });

//     // Sync the model with the database
//     await CustomerCare.sync();

//     // Create a new record with the provided status
//     await CustomerCare.create({ solved });

//     console.log('New recording inserted into PostgreSQL with status:', status);
//   } catch (error) {
//     console.error('Error inserting new recording into PostgreSQL:', error);
//     // Handle error appropriately
//   }

//   // Respond to the Twilio callback with a 200 status
//   res.status(200).end(); 
// }
 
function extractRecordingSid(recordingUrl) {
  const parts = recordingUrl.split('/');
  return parts[parts.length - 1].split('.')[0]; // Extract the RecordingSid from the URL
}
async function downloadRecording(accountSid, authToken, recordingUrl, targetPath) {
  const recordingSid = extractRecordingSid(recordingUrl);

  const options = {
    hostname: 'api.twilio.com',
    port: 443,
    path: `/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`,
    method: 'GET',
    auth: `${accountSid}:${authToken}`,
  };

  async function makeRequest() {
    return new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        if (response.statusCode === 302) {
          // If redirected, follow the redirect
          return downloadRecording(accountSid, authToken, response.headers.location, targetPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download recording. Status code: ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(targetPath);

        response.pipe(file);

        file.on('finish', () => {
          console.log('Recording downloaded successfully.');
          const recordingFilePath = '1.wav'; // Replace with the correct file path
          speechToText(recordingFilePath);
          file.close(() => {
            resolve(targetPath);
          });
        });
      });

      request.on('error', (error) => {
        fs.unlinkSync(targetPath);
        reject(error);
      });

      request.end();
    });
  }

  // Retry logic with a delay
  let retries = 3;
  let success = false;

  while (retries > 0 && !success) {
    try {
      await makeRequest();
      success = true;
    } catch (error) {
      console.error(`Retry failed. Retries left: ${retries}`);
      retries -= 1;
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5-second delay
    }
  }

  if (!success) {
    throw new Error(`Failed to download recording after retries.`);
  }
}

async function transcribeRecording(req, res) {

  const transcriptionText = req.body.TranscriptionText;
  const transcriptionStatus = req.body.transcriptionStatus;
  console.log('Transcription text:', transcriptionText);

}

function getAllData(req, res) {
  const CustomerCare = sequelize.define('customer_care', {
    name: Sequelize.STRING,
    order_id: Sequelize.STRING,
    issue: Sequelize.STRING,
    priority: Sequelize.STRING,
    solved: Sequelize.STRING,   
  });

  CustomerCare.findAll()
    .then((data) => {
      res.status(200).json(data);
    })
    .catch((err) => {
      console.error('Error retrieving data from PostgreSQL: ', err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
}
function updateSolvedStatus(req, res) {
  const { orderId, solvedStatus } = req.body;

  const CustomerCare = sequelize.define('customer_care', {
    name: Sequelize.STRING,
    order_id: Sequelize.STRING,
    issue: Sequelize.STRING,
    priority: Sequelize.STRING,
    solved: Sequelize.STRING,
  });

  CustomerCare.update(
    { solved: solvedStatus },
    { where: { order_id: orderId } }
  )
    .then((result) => {
      if (result[0] === 0) {
        // No rows were updated (orderId not found)
        res.status(404).json({ message: 'Order not found' });
      } else {
        // Rows updated successfully
        res.status(200).json({ message: 'Solved status updated successfully' });
      }
    })
    .catch((err) => {
      console.error('Error updating solved status:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    });
}
app.post('/voice', handleTwilioCall);
app.post('/handle-response', handleJsonData);
app.all('/handle-recording', handleRecording);
app.all('/transcript', transcribeRecording);
app.get('/get-all-data', getAllData);
app.post('/update-solved-status', updateSolvedStatus);

app.listen(3000, '0.0.0.0', () => {
  console.log('Server is running on port 3000');
});


