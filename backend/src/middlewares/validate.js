const validate = (schema, property = "body") => (req, res, next) => {
  const incoming = req[property] == null ? {} : req[property];
  const { error, value } = schema.validate(incoming, {
    abortEarly: true,
    stripUnknown: true,
  });

  if (error) {
    return res.status(400).json({
      message: error.details[0].message.replaceAll('"', ""),
      code: "invalid_body",
    });
  }

  req[property] = value;
  return next();
};

module.exports = validate;
