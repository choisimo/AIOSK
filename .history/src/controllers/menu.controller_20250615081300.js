// src/controllers/menu.controller.js
const Menu = require("../models/menu.model.js");

// Create and Save a new Menu
exports.create = async (req, res) => {
  // Validate request
  if (!req.body.name || req.body.price === undefined || !req.body.category_id) {
    return res.status(400).send({
      message: "Name, price, and category_id are required fields!"
    });
  }
  if (parseFloat(req.body.price) < 0) {
    return res.status(400).send({ message: "Price cannot be negative." });
  }
  // Potentially check if category_id exists in Categories table (optional, DB foreign key should handle)

  const menu = new Menu({
    name: req.body.name,
    price: req.body.price,
    category_id: req.body.category_id,
    image_url: req.body.image_url,
    description: req.body.description,
    status: req.body.status // Model handles default if undefined
  });

  try {
    const data = await Menu.create(menu);
    // To include category_name in the response of create, we might need to fetch it
    const createdMenuWithDetails = await Menu.findById(data.id);
    res.status(201).send(createdMenuWithDetails || data);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Menu."
    });
  }
};

// Retrieve all Menus from the database.
exports.findAll = async (req, res) => {
  const { category_id, name, status } = req.query;
  const filters = {};
  if (category_id) filters.category_id = parseInt(category_id, 10);
  if (name) filters.name = name;
  if (status) filters.status = status;

  try {
    const data = await Menu.getAll(filters);
    res.send(data);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving menus."
    });
  }
};

// Find a single Menu with an id
exports.findOne = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid Menu ID format." });
  }

  try {
    const data = await Menu.findById(id);
    if (data) {
      res.send(data);
    } else {
      res.status(404).send({
        message: `Cannot find Menu with id ${id}.`
      });
    }
  } catch (err) {
    // Consider if model throws specific error kinds e.g. err.kind === "not_found"
    res.status(500).send({
      message: "Error retrieving Menu with id " + id
    });
  }
};

// Update a Menu identified by the id in the request
exports.update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid Menu ID format." });
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send({
      message: "Data to update can not be empty!"
    });
  }
  
  // Validate name if provided
  if (req.body.name === "") {
    return res.status(400).send({ message: "Menu name cannot be empty if provided for update." });
  }
  // Validate price if provided
  if (req.body.price !== undefined && parseFloat(req.body.price) < 0) {
    return res.status(400).send({ message: "Price cannot be negative." });
  }

  // Construct menu data from req.body, only including fields relevant to Menu model
  const menuDataToUpdate = {};
  if (req.body.category_id !== undefined) menuDataToUpdate.category_id = req.body.category_id;
  if (req.body.name !== undefined) menuDataToUpdate.name = req.body.name;
  if (req.body.price !== undefined) menuDataToUpdate.price = req.body.price;
  if (req.body.image_url !== undefined) menuDataToUpdate.image_url = req.body.image_url;
  if (req.body.description !== undefined) menuDataToUpdate.description = req.body.description;
  if (req.body.status !== undefined) menuDataToUpdate.status = req.body.status;


  try {
    const data = await Menu.updateById(id, menuDataToUpdate);
    if (data) {
      res.send(data); // Model's updateById now returns the full updated object or object with message
    } else {
      res.status(404).send({
        message: `Cannot update Menu with id=${id}. Maybe Menu was not found or no actual change was made.`
      });
    }
  } catch (err) {
    res.status(500).send({
      message: "Error updating Menu with id " + id
    });
  }
};

// Delete a Menu with the specified id in the request
exports.delete = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid Menu ID format." });
  }

  try {
    const data = await Menu.remove(id);
    if (data) { // data will be { id: id, message: "..." } or similar
      res.send({ message: "Menu item was deleted successfully!" });
    } else {
      res.status(404).send({
        message: `Cannot delete Menu with id=${id}. Maybe it was not found.`
      });
    }
  } catch (err) {
    res.status(500).send({
      message: "Could not delete Menu with id " + id
    });
  }
};

// Delete all Menus from the database.
// This is a sensitive operation, ensure it's properly secured if exposed.
// The route for this is typically commented out or protected.
exports.deleteAll = async (req, res) => {
  const { category_id } = req.query; // Allow filtering by category_id for deletion
  
  try {
    const data = await Menu.removeAll(category_id ? parseInt(category_id, 10) : null);
    res.send({ message: data.message || 'All specified menus were deleted successfully!' });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while removing menus."
    });
  }
};

// Upload image for a specific menu
exports.uploadImage = async (req, res) => {
  const menuId = parseInt(req.params.menuId, 10);
  if (isNaN(menuId)) {
    return res.status(400).json({ message: "유효하지 않은 메뉴 ID입니다." });
  }

  // 파일이 업로드되었는지 확인
  if (!req.file) {
    return res.status(400).json({ message: "업로드할 이미지 파일을 선택해주세요." });
  }

  try {
    // 메뉴가 존재하는지 확인
    const existingMenu = await Menu.findById(menuId);
    if (!existingMenu) {
      // 파일이 이미 저장되었으므로 삭제
      const fs = require('fs');
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "메뉴를 찾을 수 없습니다." });
    }

    // 이미지 URL 생성 (웹에서 접근 가능한 경로)
    const imageUrl = `/uploads/menus/${req.file.filename}`;

    // 메뉴의 image_url 필드 업데이트
    const updatedMenu = await Menu.updateById(menuId, { image_url: imageUrl });
    
    if (!updatedMenu) {
      // 업데이트 실패 시 업로드된 파일 삭제
      const fs = require('fs');
      fs.unlinkSync(req.file.path);
      return res.status(500).json({ message: "이미지 URL 업데이트에 실패했습니다." });
    }

    res.status(200).json({
      message: "이미지가 성공적으로 업로드되었습니다.",
      imageUrl: imageUrl,
      filename: req.file.filename,
      menuId: menuId
    });

  } catch (error) {
    console.error("이미지 업로드 오류:", error);
    
    // 오류 발생 시 업로드된 파일 삭제
    if (req.file && req.file.path) {
      const fs = require('fs');
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error("임시 파일 삭제 실패:", unlinkError);
      }
    }

    res.status(500).json({
      message: "이미지 업로드 중 오류가 발생했습니다."
    });
  }
};
