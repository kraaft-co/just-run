/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Calculates the SHA256 hash value of a file at the specified file path.
 *
 * @param {string} filePath - The path of the file to calculate the hash for.
 * @returns {Promise<string>} A Promise that resolves with the SHA256 hash value of the file.
 *
 * @throws {Error} If an error occurs during file read or hashing process.
 */
async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (data) => hash.update(data));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

function hashFileSync(filePath) {
  const hash = crypto.createHash("sha256");
  const file = fs.readFileSync(filePath);
  hash.update(file);
  return hash.digest("hex");
}

/**
 * Computes the SHA256 hash of all files in a directory, including subdirectories.
 *
 * @param {string} directory - The path to the directory to hash.
 * @return {Promise<string>} A promise that resolves with the hexadecimal SHA256 hash value.
 */
async function hashDirectory(directory) {
  const hash = crypto.createHash("sha256");
  const files = [];

  async function readDir(dir) {
    const items = await fs.promises.readdir(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = await fs.promises.stat(fullPath);

      if (stats.isDirectory()) {
        await readDir(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  await readDir(directory);

  files.sort();

  for (const file of files) {
    const relativePath = path.relative(directory, file);
    hash.update(relativePath);
    const fileHash = await hashFile(file);
    hash.update(fileHash);
  }

  return hash.digest("hex");
}

/**
 * Same as {@link hashDirectory} but synchronous.
 * @param {string} directory - The path to the directory to hash.
 * @return {Promise<string>} A promise that resolves with the hexadecimal SHA256 hash value.
 */
function hashDirectorySync(directory) {
  const hash = crypto.createHash("sha256");
  const files = [];

  function readDir(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        readDir(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  readDir(directory);

  files.sort();

  for (const file of files) {
    const relativePath = path.relative(directory, file);
    hash.update(relativePath);
    const fileHash = hashFileSync(file);
    hash.update(fileHash);
  }

  return hash.digest("hex");
}

/**
 * Hashes an array of input files or directories using the SHA256 algorithm.
 *
 * @param inputs - An array of strings representing the paths to input files or directories.
 * @throws {Error} - If any of the input files does not exist.
 * @returns {Promise<string>} - A promise that resolves when all inputs have been hashed.
 */
async function hashInputs(inputs, cwd) {
  const hash = crypto.createHash("sha256");

  const sortedInput = [...inputs].map(it => path.resolve(cwd, it)).sort();

  console.log("sorted inputs", sortedInput);

  for (const input of sortedInput) {
    if (!fs.existsSync(input))
      throw new Error(`input file ${input} does not exist`);

    const stats = await fs.promises.stat(input);

    if (stats.isDirectory()) {
      hash.update(await hashDirectory(input));
    } else {
      hash.update(await hashFile(input));
    }
  }
  return hash.digest("hex");
}


/**
 * Same as {@link hashInputs} but synchronous.
 * @param inputs - An array of strings representing the paths to input files or directories.
 * @throws {Error} - If any of the input files does not exist.
 * @returns {string} - A promise that resolves when all inputs have been hashed.
 */
function hashInputsSync(inputs, cwd) {
  const hash = crypto.createHash("sha256");

  const sortedInput = [...inputs].map(it => path.resolve(cwd, it)).sort();

  for (const input of sortedInput) {
    if (!fs.existsSync(input))
      throw new Error(`input file ${input} does not exist`);

    const stats = fs.statSync(input);

    if (stats.isDirectory()) {
      hash.update(hashDirectorySync(input));
    } else {
      hash.update(hashFileSync(input));
    }
  }
  return hash.digest("hex");
}

module.exports = {
  hashInputs,
  hashInputsSync,
};
