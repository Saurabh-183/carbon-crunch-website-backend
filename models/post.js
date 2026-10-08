import mongoose  from 'mongoose';

const postSchema = new mongoose.Schema({
  title: String,
  content: String,
  picture: String,
  username: String,
  categories: [String],
  createdDate: Date
});

export default mongoose.model('Post', postSchema);
