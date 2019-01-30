const express = require("express");
const router = express.Router();
require("dotenv").config();

const authMiddleware = require("./middlewares/auth");

router.use(authMiddleware);

module.exports = (mysql, io) => {
  router.get("/peoples/:searchText/:page", async (req, res) => {
    try {
      const { searchText, page } = req.params;
      const numberItems = 10;
      const limit = numberItems * page - numberItems;

      const [users] = await mysql.query(
        `SELECT SQL_CALC_FOUND_ROWS id, username, picture FROM users WHERE email = ? OR username LIKE ? LIMIT ${limit},${numberItems}`,
        [searchText, `%${searchText}%`]
      );

      const [totalItems] = await mysql.query("SELECT FOUND_ROWS() as count");

      if (users.length > 0) {
        res.json({
          metadata: {
            totalItems: totalItems[0].count,
            items: users.length,
            pages: Math.ceil(totalItems[0].count / numberItems)
          },
          users: users
        });
      } else {
        res.status(200).json([]);
      }
    } catch (e) {
      console.log(e);
      res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
    }
  });

  router.get("/contacts/:page", async (req, res) => {
    try {
      const { page } = req.params;
      const numberItems = 10;
      const limit = numberItems * page - numberItems;

      const [users] = await mysql.query(
        `SELECT SQL_CALC_FOUND_ROWS users.id, users.username, users.picture FROM friends INNER JOIN users ON friends.user_b = users.id WHERE user_a = ? LIMIT ${limit},${numberItems}`,
        [req.userId]
      );

      const [totalItems] = await mysql.query("SELECT FOUND_ROWS() as count");

      if (users.length > 0) {
        res.json({
          metadata: {
            totalItems: totalItems[0].count,
            items: users.length,
            pages: Math.ceil(totalItems[0].count / numberItems)
          },
          users: users
        });
      } else {
        res.status(200).json([]);
      }
    } catch (e) {
      console.log(e);
      res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
    }
  });

  router.post("/contacts", async (req, res) => {
    try {
      const { id } = req.body;

      const [verifyUser] = await mysql.query(
        "SELECT id FROM users WHERE id = ?",
        [id]
      );

      if (!verifyUser.length > 0) {
        res.status(200).json({ code: "USER_NOT_FOUND" });
        return;
      }

      const [verifyFriend] = await mysql.query(
        "SELECT * FROM friends WHERE user_a = ? AND user_b = ?",
        [req.userId, id]
      );

      if (verifyFriend.length > 0) {
        res.status(200).json({ code: "CONTACT_ALREADY_ADDED" });
        return;
      }

      const [addUser] = await mysql.query(
        "INSERT INTO friends (user_a, user_b, date_time) VALUES (?,?,?)",
        [req.userId, id, new Date()]
      );

      if (addUser.affectedRows === 1) {
        res.status(200).json({ code: "CONTACT_ADDED" });
      }
    } catch (e) {
      console.log(e);
      res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
    }
  });

  router.post("/message/:toId", async (req, res) => {
    try {
      const { message } = req.body;
      const { toId } = req.params;

      const [session] = await mysql.query(
        "SELECT * FROM sessions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        [toId]
      );

      if (session[0].status === 1) {
        const [fromUser] = await mysql.query(
          "SELECT * FROM users WHERE id = ?",
          [req.userId]
        );

        io.to(session[0].websocket_id).emit("message", {
          from: {
            id: fromUser[0].id,
            username: fromUser[0].username,
            picture: fromUser[0].picture
          },
          message: message
        });
      }

      await mysql.query(
        "INSERT INTO messages (data, from_id, to_id, date_time) VALUES (?,?,?,?)",
        [message, req.userId, toId, new Date()]
      );

      res.json({ code: "MESSAGE_SENT" });
    } catch (e) {
      console.log(e);
      res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
    }
  });

  return router;
};
