const multer = require("multer");
const { insert, search, getById, update, deleteById } = require("./service");
const { validate } = require("./request");
const { name } = require("./model");
const { VIDEO_QUEUE_EVENTS: QUEUE_EVENTS } = require("../../queues/constants");

const { addQueueItem } = require("../../queues/queue");

const BASE_URL = `/api/${name}`;

const setupRoutes = (app) => {
  console.log(`Setting up routes for ${name}`);

  // return empty response with success message for the base route
  app.get(`${BASE_URL}/`, async (req, res) => {
    console.log(`GET`, req.params);
    res.send({ status: "success", message: "OK", timestamp: new Date() });
  });

  app.get(`${BASE_URL}/detail/:id`, async (req, res) => {
    console.log(`GET`, req.params);
    const student = await getById(req.params.id);
    res.send(student);
  });

  // TODO: Proper searching with paging and ordering
  app.post(`${BASE_URL}/search`, async (req, res) => {
    console.log("POST search", req.body);
    const result = await search(req.body);
    res.send(result);
  });

  app.post(`${BASE_URL}/create`, async (req, res) => {
    console.log("POST create", req.body);
    const validationResult = validate(req.body);
    if (!validationResult.error) {
      const result = await insert(req.body);
      if (result instanceof Error) {
        res.status(400).json(JSON.parse(result.message));
        return;
      }
      return res.json(result);
    }
    return res
      .status(400)
      .json({ status: "error", message: validationResult.error });
  });

  app.put(`${BASE_URL}/update/:id`, async (req, res) => {
    console.log("PUT", req.params.id);
    const validationResult = validate(req.body);
    if (req.params.id && !validationResult.error) {
      const result = await update(req.params.id, req.body);
      if (result instanceof Error) {
        res.status(400).json(JSON.parse(result.message));
        return;
      }
      return res.json(result);
    }
    return res
      .status(400)
      .json({ status: "error", message: validationResult.error });
  });

  app.delete(`${BASE_URL}/delete/:id`, async (req, res) => {
    console.log("DELETE", req.params.id);
    if (req.params.id) {
      const result = await deleteById(req.params.id);
      if (result instanceof Error) {
        res.status(400).json(JSON.parse(result.message));
        return;
      }
      return res.json(result);
    }
    return res.status(400).json({ status: "error", message: "Id required" });
  });

  // upload videos handler using multer package routes below.

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/videos");
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix);
    },
  });

  const fileFilter = (req, file, cb) => {
    if (file.mimetype === "video/mp4" || file.mimetype === "video/x-matroska") {
      console.log("file type supported", file);
      cb(null, true);
    } else {
      console.log("file type not supported", file);
      cb(new multer.MulterError("File type not supported"), false);
    }
  };

  const upload = multer({
    dest: "uploads/videos",
    fileFilter: fileFilter,
    limits: { fileSize: 50000000 },
    storage: storage,
  }).single("video");

  const uploadProcessor = (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        //console.error(err);
        res.status(400).json({ status: "error", error: err });
        return;
      } else {
        console.log("upload success", req.file);
        // res.status(200).json({ status: "success", message: "upload success" });
        next();
      }
    });
  };

  app.post(`${BASE_URL}/upload`, uploadProcessor, async (req, res) => {
    try {
      console.log("POST upload", JSON.stringify(req.body));
      const payload = { ...req.body };
      console.log("user given metadata", "title", payload.title);
      await addQueueItem(QUEUE_EVENTS.VIDEO_UPLOADED, {
        ...payload,
        ...req.file,
      });
      res
        .status(200)
        .json({ status: "success", message: "Upload success", ...req.file });
      return;
    } catch (error) {
      console.error(error);
      res.send(error);
    }
  });
};

module.exports = { setupRoutes };
