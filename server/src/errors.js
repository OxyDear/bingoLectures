class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const badRequest = (m) => new HttpError(400, m);
const notFound = (m = 'Не найдено') => new HttpError(404, m);

module.exports = { HttpError, badRequest, notFound };
