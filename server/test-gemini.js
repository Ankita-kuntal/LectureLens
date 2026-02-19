require("dotenv").config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const modelsToTest = [
  "gemini-pro",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-2.0-flash-exp",
  "gemini-exp-1206"
];

async function testModel(modelName) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: "Hello" }]
          }]
        })
      }
    );
    
    if (response.status === 200) {
      console.log(`✅ ${modelName} - WORKS!`);
      return true;
    } else {
      console.log(`❌ ${modelName} - Status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${modelName} - Error: ${error.message}`);
    return false;
  }
}

async function testAllModels() {
  console.log("🔍 Testing Gemini models with your API key...\n");
  
  for (const model of modelsToTest) {
    await testModel(model);
  }
  
  console.log("\n✅ Test complete! Use any model marked with ✅ in your server.js");
}

testAllModels();