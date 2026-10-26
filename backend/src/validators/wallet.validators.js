const Joi = require("joi");
const { MIN_TRANSFER_KOBO, MAX_CHARGE_KOBO } = require("../helpers/money");

const listTransactionsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(20),
  cursor: Joi.string().hex().length(24),
});

const lookupAccountSchema = Joi.object({
  accountNumber: Joi.string().pattern(/^\d{10}$/).required().messages({
    "any.required": "Enter the 10-digit account number.",
    "string.pattern.base": "Enter the 10-digit account number.",
  }),
});

const transferSchema = Joi.object({
  accountNumber: Joi.string().pattern(/^\d{10}$/).required().messages({
    "any.required": "Enter the 10-digit account number.",
    "string.pattern.base": "Enter the 10-digit account number.",
  }),
  amountKobo: Joi.number().integer().min(MIN_TRANSFER_KOBO).max(MAX_CHARGE_KOBO).required().messages({
    "any.required": "Enter an amount to send.",
    "number.base": "Enter an amount to send.",
    "number.min": "The smallest transfer is ₦1.",
    "number.max": "The largest transfer is ₦5,000,000.",
  }),
  idempotencyKey: Joi.string().trim().min(8).max(80).required(),
});

module.exports = { listTransactionsSchema, lookupAccountSchema, transferSchema };
