// Allows us to pass a function `func` which can then pass any errors
// on to `next` an Express route handler.
module.exports = func => {
  return (req, res, next) => {
    func(req, res, next).catch(next);
  }
}