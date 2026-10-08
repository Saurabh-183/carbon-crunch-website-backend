import express  from 'express';
import mongoose  from 'mongoose';
import { errorHandler } from './src/core/ResponseHandler.js';
import cors  from 'cors';
import Post  from './models/post.js';
import BookDemo  from './models/bookDemo.js';
import dotenv  from 'dotenv';
import './database/db.js';
dotenv.config();


import cookieParser from 'cookie-parser';
import fileUpload from 'express-fileupload';

const app = express();
app.use(cors({
  origin: ['https://www.carboncrunch.in', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(fileUpload({ useTempFiles: true }));

// GHG Calculator Routes
import authRoutes  from './src/routes/authRoutes.js';
import ghgRoutes  from './src/routes/ghgRoutes.js';
import icaiUserRoutes from './src/routes/user.routes.js';
import icaiSubmissionRoutes from './src/routes/submission.routes.js';
import icaiAuthRoutes from './src/modules/iam/routes/auth.routes.js';

app.use('/api/auth', authRoutes); // old auth routes
app.use('/api/ghg', ghgRoutes);
app.use('/api/users', icaiUserRoutes);
app.use('/api/submissions', icaiSubmissionRoutes);
app.use('/api/v2/auth', icaiAuthRoutes); // Mount ICAI auth routes under v2 to avoid conflicts


app.get('/api/posts', async (req, res) => {
  try {
    const posts = await Post.find();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const blog = await Post.findById(id); // Correct model used here
        if (!blog) return res.status(404).send("Blog not found");
        res.json(blog);
    } catch (err) {
        res.status(500).send("Error fetching blog");
    }
});
  



// Book Demo route

app.post("/book-demo", async (req, res) => {
    try {
        const { name, email, company, message } = req.body;
        if (!name || !email || !company || !message) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const newEntry = new BookDemo({ name, email, company, message });
        await newEntry.save();

        res.status(201).json(newEntry);
    } catch (error) {
        console.error("Error in /book-demo route:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Subscription model
const SubscriptionSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true }
}, { timestamps: true });
const Subscription = mongoose.model("Subscription", SubscriptionSchema);

// Subscribe to newsletter
app.post("/subscribe", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });
        
        const newSubscription = new Subscription({ email });
        await newSubscription.save();
        
        res.status(201).json({ message: "Subscription successful" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
