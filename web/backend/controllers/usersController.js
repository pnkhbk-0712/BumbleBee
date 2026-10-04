import db from "../config/db.js";

// 📥 Lấy toàn bộ user
export const getUsers = (req, res) => {
  const sql = "SELECT * FROM users";
  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Lỗi server khi truy vấn");
    }
    res.json(results);
  });
};

// ➕ Thêm user mới
export const addUser = (req, res) => {
  const { name, email } = req.body;
  const sql = "INSERT INTO users (name, email) VALUES (?, ?)";
  db.query(sql, [name, email], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Lỗi server khi thêm dữ liệu");
    }
    res.json({ message: "Thêm thành công", id: result.insertId });
  });
};

// 🗑️ Xóa user
export const deleteUser = (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM users WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Lỗi server khi xóa dữ liệu");
    }
    res.json({ message: "Đã xóa user!" });
  });
};

// ✏️ Sửa user
export const updateUser = (req, res) => {
  const { id } = req.params;
  const { name, email } = req.body;
  const sql = "UPDATE users SET name = ?, email = ? WHERE id = ?";
  db.query(sql, [name, email, id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Lỗi server khi cập nhật dữ liệu");
    }
    res.json({ message: "Cập nhật thành công!" });
  });
};
