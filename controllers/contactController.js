const Contact = require("../models/Contact");
const asyncHandler = require("../middleware/asyncHandler");

const submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, company, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400);
    throw new Error("Please fill in all required fields");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error("Please provide a valid email address");
  }

  const contact = await Contact.create({
    name,
    email,
    phone,
    company,
    subject,
    message,
  });

  res.status(201).json(contact);
});

// @desc    Get all contact messages
// @route   GET /api/contact
// @access  Private/Admin
const getContactMessages = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100, status } = req.query;
  const query = {};
  
  if (status) query.status = String(status);

  const messages = await Contact.find(query)
    .sort("-createdAt")
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit));
    
  res.json(messages);
});

// @desc    Delete contact message
// @route   DELETE /api/contact/:id
// @access  Private/Admin
const deleteContactMessage = asyncHandler(async (req, res) => {
  const message = await Contact.findById(req.params.id);

  if (message) {
    await message.deleteOne();
    res.json({ message: "Message removed" });
  } else {
    res.status(404);
    throw new Error("Message not found");
  }
});

// @desc    Update contact message status
// @route   PUT /api/contact/:id/status
// @access  Private/Admin
const updateContactStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const message = await Contact.findById(req.params.id);

  if (message) {
    message.status = status;
    const updatedMessage = await message.save();
    res.json(updatedMessage);
  } else {
    res.status(404);
    throw new Error("Message not found");
  }
});

module.exports = {
  submitContact,
  getContactMessages,
  deleteContactMessage,
  updateContactStatus,
};
