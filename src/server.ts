import 'dotenv/config';
console.log('Running Node:', process.version);


import app from "./app.js";

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});