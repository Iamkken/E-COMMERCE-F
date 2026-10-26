const Joi = require("joi");
const { MIN_TOPUP_KOBO, MAX_CHARGE_KOBO } = require("../helpers/money");

const topUpSchema = Joi.object({
  amountKobo: Joi.number().integer().min(MIN_TOPUP_KOBO).max(MAX_CHARGE_KOBO).required().messages({
    "any.required": "Enter an amount to add.",
    "number.base": "Enter an amount to add.",
    "number.integer": "Enter a whole naira amount.",
    "number.min": "The smallest top up is ₦100.",
    "number.max": "The largest top up is ₦5,000,000.",
  }),
});

const checkoutSchema = Joi.object({
  method: Joi.string().valid("paystack", "wallet").required(),
  idempotencyKey: Joi.string().trim().min(8).max(80).required(),
});

const verifySchema = Joi.object({
  reference: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9._=-]+$/)
    .max(100)
    .required(),
});

module.exports = { topUpSchema, checkoutSchema, verifySchema };
