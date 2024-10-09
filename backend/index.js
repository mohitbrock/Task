const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors"); // Import cors at the top

const app = express();
app.use(express.json()); // Parse JSON bodies
app.use(cors()); // Enable all CORS requests

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/mern-task", { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

// Start the server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Define the Mongoose model
const transactionSchema = new mongoose.Schema({
  title: String,
  description: String,
  price: Number,
  dateOfSale: Date,
  sold: Boolean,
  category: String, // Ensure 'category' exists in the data or define it
});

const Transaction = mongoose.model("Transaction", transactionSchema);

// API to initialize the database
app.get("/initialize-db", async (req, res) => {
  try {
    const response = await axios.get("https://s3.amazonaws.com/roxiler.com/product_transaction.json");
    const transactions = response.data;

    // Insert data into MongoDB
    await Transaction.insertMany(transactions);
    res.status(200).send("Database initialized with seed data");
  } catch (error) {
    res.status(500).send("Error fetching data or initializing the database");
  }
});

// API to list transactions with search and pagination
app.get("/transactions", async (req, res) => {
  const { page = 1, perPage = 10, search = "", month } = req.query;

  // Calculate start and end dates for the month
  const startDate = new Date(`2023-${month}-01`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  try {
    const regex = new RegExp(search, "i");  // Case-insensitive search
    const transactions = await Transaction.find({
      dateOfSale: { $gte: startDate, $lt: endDate },
      $or: [{ title: regex }, { description: regex }, { price: { $regex: search } }],
    })
      .skip((page - 1) * perPage)
      .limit(Number(perPage));

    res.json(transactions);
  } catch (error) {
    res.status(500).send("Error fetching transactions");
  }
});

// API to fetch monthly statistics
app.get("/statistics", async (req, res) => {
  const { month } = req.query;

  const startDate = new Date(`2023-${month}-01`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  try {
    const totalSales = await Transaction.aggregate([
      { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: null, totalAmount: { $sum: "$price" }, soldItems: { $sum: { $cond: ["$sold", 1, 0] } } } },
    ]);

    const totalUnsold = await Transaction.countDocuments({ sold: false, dateOfSale: { $gte: startDate, $lt: endDate } });

    res.json({
      totalAmount: totalSales[0]?.totalAmount || 0,
      soldItems: totalSales[0]?.soldItems || 0,
      unsoldItems: totalUnsold,
    });
  } catch (error) {
    res.status(500).send("Error fetching statistics");
  }
});

// API to fetch bar chart data (price range)
app.get("/bar-chart", async (req, res) => {
  const { month } = req.query;

  const startDate = new Date(`2023-${month}-01`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  try {
    const priceRanges = await Transaction.aggregate([
      { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
      {
        $bucket: {
          groupBy: "$price",
          boundaries: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, Infinity],
          default: "901-above",
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    res.json(priceRanges);
  } catch (error) {
    res.status(500).send("Error fetching bar chart data");
  }
});

// API to fetch pie chart data (categories)
app.get("/pie-chart", async (req, res) => {
  const { month } = req.query;

  const startDate = new Date(`2023-${month}-01`);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  try {
    const categories = await Transaction.aggregate([
      { $match: { dateOfSale: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: "$category", count: { $sum: 1 } } }, // Group by category
    ]);

    res.json(categories);
  } catch (error) {
    res.status(500).send("Error fetching pie chart data");
  }
});

// API to fetch combined data (statistics, bar chart, pie chart)
app.get("/combined-data", async (req, res) => {
  const { month } = req.query;

  try {
    const [statistics, barChart, pieChart] = await Promise.all([
      axios.get(`http://localhost:5000/statistics?month=${month}`),
      axios.get(`http://localhost:5000/bar-chart?month=${month}`),
      axios.get(`http://localhost:5000/pie-chart?month=${month}`)
    ]);

    res.json({
      statistics: statistics.data,
      barChart: barChart.data,
      pieChart: pieChart.data,
    });
  } catch (error) {
    res.status(500).send("Error fetching combined data");
  }
});
app.get("/transactions", async (req, res) => {
  const { page = 1, perPage = 10, search = "", month } = req.query;

  // Check if month is a valid number (1-12)
  if (!month || month < 1 || month > 12) {
    return res.status(400).json({ error: "Invalid month parameter" });
  }

  // Calculate start and end dates for the month
  const startDate = new Date(`2023-${month}-01`); // Replace 2023 with current year if needed
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  try {
    const regex = new RegExp(search, "i");  // Case-insensitive search
    const transactions = await Transaction.find({
      dateOfSale: { $gte: startDate, $lt: endDate },
      $or: [{ title: regex }, { description: regex }, { price: { $regex: search } }],
    })
      .skip((page - 1) * perPage)
      .limit(Number(perPage));

    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error); // Log error for debugging
    res.status(500).send("Error fetching transactions");
  }
});

