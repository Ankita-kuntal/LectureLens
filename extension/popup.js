document.getElementById("askBtn").addEventListener("click", async () => {
  const prompt = document.getElementById("question").value;
  const responseBox = document.getElementById("response");

  responseBox.innerText = "Thinking...";

  try {
    const res = await fetch("http://localhost:5000/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();

    if (data.answer) {
      responseBox.innerText = data.answer;
    } else {
      responseBox.innerText = "Error getting AI response";
    }
  } catch (error) {
    responseBox.innerText = "Backend not running";
  }
});