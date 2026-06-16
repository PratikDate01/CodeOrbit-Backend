const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("Attempting to connect to MongoDB...");
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Drop the unique user_1_program_1 index on enrollments if it exists to support multiple enrollments
    try {
      const enrollmentsCollection = mongoose.connection.collection("enrollments");
      const indexes = await enrollmentsCollection.indexes();
      const hasDuplicateIndex = indexes.some(index => index.name === "user_1_program_1");
      if (hasDuplicateIndex) {
        await enrollmentsCollection.dropIndex("user_1_program_1");
        console.log("Successfully dropped user_1_program_1 index from enrollments collection");
      }
    } catch (indexError) {
      console.warn("Could not drop user_1_program_1 index:", indexError.message);
    }
    
    // Add event listeners for the connection
    mongoose.connection.on("error", (err) => {
      console.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });

  } catch (error) {
    console.error(`MongoDB Initial Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
