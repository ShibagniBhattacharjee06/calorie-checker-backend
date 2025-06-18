require('dotenv').config();
const express = require('express');
const axios = require('axios');
const formidable = require('formidable');
const cors = require('cors');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// ✅ Debugging: Check if environment variables are loaded
const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

console.log('🔍 IMGBB_API_KEY:', IMGBB_API_KEY ? 'Loaded ✅' : 'Missing ❌');
console.log('🔍 GROQ_API_KEY:', GROQ_API_KEY ? 'Loaded ✅' : 'Missing ❌');

// ✅ HEALTH CHECK ROUTE
app.get('/', (req, res) => {
  res.send('Backend is up and running!');
});

// 🔧 Upload Endpoint
app.post('/upload', (req, res) => {
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err || !files.image || !files.image[0]) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }

    try {
      const imagePath = files['image'][0].filepath;
      const imageStream = fs.createReadStream(imagePath);
      const formData = new FormData();
      formData.append('image', imageStream);

      const imgbbResponse = await axios.post(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
        formData,
        {
          headers: formData.getHeaders()
        }
      );

      if (imgbbResponse.data.success) {
        res.json({ success: true, url: imgbbResponse.data.data.url });
      } else {
        res.status(500).json({ success: false, error: 'Image upload failed' });
      }
    } catch (error) {
      console.error('❌ ImgBB Error:', error.response?.data || error.message);
      res.status(500).json({ success: false, error: 'Server error during image upload' });
    }
  });
});

// 🔍 Analyze Image Endpoint
app.post('/analyze', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ success: false, error: 'No image URL provided' });
  }

  try {
    const groqResponse = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Give calories of each item in this image in this below JSON format only\n {items:[{item_name:name of item, total_calories:in gm, total_protein:in gm, total_carbs:in gm, total_fats:in gm},...]}' },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }],
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        temperature: 1,
        max_completion_tokens: 1024,
        top_p: 1,
        stream: false,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = JSON.parse(groqResponse.data.choices[0].message.content);
    res.json({ success: true, items: content.items });
  } catch (error) {
    console.error('❌ Groq Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

// ✅ START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
