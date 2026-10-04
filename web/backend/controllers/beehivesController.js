import db from "../config/db.js";

// Lấy tất cả beehives
export const getBeehives = (req, res) => {
  const sql = "SELECT * FROM beehives";
  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Lỗi server khi truy vấn beehives");
    }
    res.json(results);
  });
};

// Thêm beehive mới
export const addBeehive = (req, res) => {
  const { name, lng, lat, farm_id } = req.body;
  if (!name || typeof lng !== 'number' || typeof lat !== 'number') {
    return res.status(400).json({ error: 'Thiếu trường bắt buộc: name,lng,lat' });
  }

  const ensureFarmId = (cb) => {
    if (farm_id) return cb(farm_id);
    // find an existing farm or create a default one
    db.query('SELECT id FROM farms LIMIT 1', (err, rows) => {
      if (err) return cb(null);
      if (rows && rows.length > 0) return cb(rows[0].id);
      // create a default farm
      db.query('INSERT INTO farms (name) VALUES (?)', ['Default Farm'], (err2, result2) => {
        if (err2) return cb(null);
        return cb(result2.insertId);
      });
    });
  };

  ensureFarmId((useFarmId) => {
    if (!useFarmId) return res.status(500).send('Không thể xác định farm_id');
    const sql = "INSERT INTO beehives (name, lng, lat, farm_id) VALUES (?, ?, ?, ?)";
    db.query(sql, [name, lng, lat, useFarmId], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Lỗi server khi thêm beehive");
      }
      // fetch the newly inserted row and return it
      const sel = "SELECT * FROM beehives WHERE id = ? LIMIT 1";
      db.query(sel, [result.insertId], (err2, rows) => {
        if (err2) {
          console.error(err2);
          return res.status(500).send("Lỗi server khi lấy beehive vừa tạo");
        }
        res.json(rows[0]);
      });
    });
  });

};

// Xóa beehive
export const deleteBeehive = (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM beehives WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Lỗi server khi xóa beehive");
    }
    res.json({ message: "Đã xóa beehive" });
  });
};

// Cập nhật beehive
export const updateBeehive = (req, res) => {
  const { id } = req.params;
  const { name, lng, lat, farm_id } = req.body;
  console.log(`updateBeehive called for id=${id} body=`, req.body);

  // Fetch existing beehive first
  db.query('SELECT * FROM beehives WHERE id = ? LIMIT 1', [id], (selErr, rows) => {
    if (selErr) {
      console.error('Error selecting beehive before update:', selErr);
      return res.status(500).send('Lỗi server khi truy vấn beehive');
    }
    if (!rows || rows.length === 0) {
      return res.status(404).send('Beehive không tồn tại');
    }

    const existing = rows[0];
    console.log('Existing beehive row:', existing);

    // Determine new values (use provided when defined, otherwise keep existing)
    const newName = typeof name === 'undefined' ? existing.name : name;
    const newLng = typeof lng === 'undefined' ? existing.lng : lng;
    const newLat = typeof lat === 'undefined' ? existing.lat : lat;

    // Update only name, lng, lat. Do NOT touch farm_id (keep existing).
    const sql = 'UPDATE beehives SET name = ?, lng = ?, lat = ? WHERE id = ?';
    db.query(sql, [newName, newLng, newLat, id], (err) => {
      if (err) {
        console.error('Error updating beehive:', err);
        return res.status(500).send('Lỗi server khi cập nhật beehive');
      }
      // return the updated row
      db.query('SELECT * FROM beehives WHERE id = ? LIMIT 1', [id], (err2, updatedRows) => {
        if (err2) {
          console.error('Error fetching updated beehive:', err2);
          return res.status(500).send('Lỗi server khi lấy beehive vừa cập nhật');
        }
        console.log('Updated beehive row:', updatedRows[0]);
        res.json(updatedRows[0]);
      });
    });
  });
};
