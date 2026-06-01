// src/controllers/menu.controller.js
const fs = require('fs');
const Menu = require("../models/menu.model.js");
const logger = require("../utils/logger.js");

const MENU_STATUSES = ['FOR_SALE', 'SOLD_OUT'];

const parsePositiveInteger = (value) => {
  const text = typeof value === 'number'
    ? String(value)
    : (typeof value === 'string' ? value.trim() : '');
  const parsed = /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseNonNegativePrice = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const text = typeof value === 'string' ? value.trim() : '';
  const parsed = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? Number(text) : null;
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRequiredText = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
};

const normalizeOptionalText = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
};

const parseMenuStatus = (value, allowDefault) => {
  if (value === undefined || (allowDefault && value === '')) return undefined;
  if (typeof value !== 'string') return null;
  const status = value.trim();
  return MENU_STATUSES.includes(status) ? status : null;
};

const removeUploadedFile = (file, req, context) => {
  if (!file?.path) return;

  try {
    fs.unlinkSync(file.path);
  } catch (unlinkError) {
    logger.logError(unlinkError, req, { context });
  }
};

// Create and Save a new Menu
exports.create = async (req, res) => {
  // Validate request
  const name = normalizeRequiredText(req.body.name);
  if (!name || req.body.price === undefined || req.body.category_id === undefined || req.body.category_id === '') {
    return res.status(400).send({
      message: "Name, price, and category_id are required fields!"
    });
  }
  const categoryId = parsePositiveInteger(req.body.category_id);
  if (categoryId === null) {
    return res.status(400).send({ message: "Invalid category_id format." });
  }
  const price = parseNonNegativePrice(req.body.price);
  if (price === null) {
    return res.status(400).send({ message: "Price must be a non-negative number." });
  }
  const status = parseMenuStatus(req.body.status, true);
  if (status === null) {
    return res.status(400).send({ message: "Invalid menu status." });
  }
  if (req.body.image_url !== undefined && req.body.image_url !== null && typeof req.body.image_url !== 'string') {
    return res.status(400).send({ message: "image_url must be a string if provided." });
  }
  if (req.body.description !== undefined && req.body.description !== null && typeof req.body.description !== 'string') {
    return res.status(400).send({ message: "description must be a string if provided." });
  }
  const imageUrl = normalizeOptionalText(req.body.image_url);
  const description = normalizeOptionalText(req.body.description);
  // Potentially check if category_id exists in Categories table (optional, DB foreign key should handle)

  const menu = {
    name,
    price,
    category_id: categoryId,
    image_url: imageUrl,
    description,
    status // Model handles default if undefined
  };

  try {
    const data = await Menu.create(menu);
    // To include category_name in the response of create, we might need to fetch it
    const createdMenuWithDetails = await Menu.findById(data.id);
    res.status(201).send(createdMenuWithDetails || data);
  } catch (err) {
    logger.logError(err, req, { context: 'Admin menu create' });
    res.status(500).send({
      message: "Some error occurred while creating the Menu."
    });
  }
};

// Retrieve all Menus from the database.
exports.findAll = async (req, res) => {
  const { category_id, name, status } = req.query;
  const filters = {};
  if (category_id !== undefined && category_id !== '') {
    const parsedCategoryId = parsePositiveInteger(category_id);
    if (parsedCategoryId === null) {
      return res.status(400).send({ message: "Invalid category_id format." });
    }
    filters.category_id = parsedCategoryId;
  }
  if (name !== undefined && name !== '') {
    if (typeof name !== 'string') {
      return res.status(400).send({ message: "Invalid name filter." });
    }
    filters.name = name.trim();
  }
  if (status !== undefined && status !== '') {
    const normalizedStatus = parseMenuStatus(status, false);
    if (normalizedStatus === null) {
      return res.status(400).send({ message: "Invalid menu status." });
    }
    filters.status = normalizedStatus;
  }

  try {
    const data = await Menu.getAll(filters);
    res.send(data);
  } catch (err) {
    logger.logError(err, req, { context: 'Admin menu list' });
    res.status(500).send({
      message: "Some error occurred while retrieving menus."
    });
  }
};

// Find a single Menu with an id
exports.findOne = async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (id === null) {
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
    logger.logError(err, req, { context: 'Admin menu detail' });
    res.status(500).send({
      message: "Error retrieving Menu with id " + id
    });
  }
};

// Update a Menu identified by the id in the request
exports.update = async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (id === null) {
    return res.status(400).send({ message: "Invalid Menu ID format." });
  }

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).send({
      message: "Data to update can not be empty!"
    });
  }
  
  // Validate name if provided
  if (req.body.name !== undefined && normalizeRequiredText(req.body.name) === null) {
    return res.status(400).send({ message: "Menu name cannot be empty if provided for update." });
  }
  // Construct menu data from req.body, only including fields relevant to Menu model
  const menuDataToUpdate = {};
  if (req.body.category_id !== undefined) {
    const categoryId = parsePositiveInteger(req.body.category_id);
    if (categoryId === null) {
      return res.status(400).send({ message: "Invalid category_id format." });
    }
    menuDataToUpdate.category_id = categoryId;
  }
  if (req.body.name !== undefined) menuDataToUpdate.name = normalizeRequiredText(req.body.name);
  if (req.body.price !== undefined) {
    const price = parseNonNegativePrice(req.body.price);
    if (price === null) {
      return res.status(400).send({ message: "Price must be a non-negative number." });
    }
    menuDataToUpdate.price = price;
  }
  if (req.body.image_url !== undefined) {
    if (req.body.image_url !== null && typeof req.body.image_url !== 'string') {
      return res.status(400).send({ message: "image_url must be a string if provided." });
    }
    menuDataToUpdate.image_url = normalizeOptionalText(req.body.image_url);
  }
  if (req.body.description !== undefined) {
    if (req.body.description !== null && typeof req.body.description !== 'string') {
      return res.status(400).send({ message: "description must be a string if provided." });
    }
    menuDataToUpdate.description = normalizeOptionalText(req.body.description);
  }
  if (req.body.status !== undefined) {
    const status = parseMenuStatus(req.body.status, false);
    if (status === null) {
      return res.status(400).send({ message: "Invalid menu status." });
    }
    menuDataToUpdate.status = status;
  }


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
    logger.logError(err, req, { context: 'Admin menu update' });
    res.status(500).send({
      message: "Error updating Menu with id " + id
    });
  }
};

// Delete a Menu with the specified id in the request
exports.delete = async (req, res) => {
  const id = parsePositiveInteger(req.params.id);
  if (id === null) {
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
    logger.logError(err, req, { context: 'Admin menu delete' });
    res.status(500).send({
      message: "Could not delete Menu with id " + id
    });
  }
};

// Upload image for a specific menu
exports.uploadImage = async (req, res) => {
  const menuId = parsePositiveInteger(req.params.menuId);
  if (menuId === null) {
    removeUploadedFile(req.file, req, 'Menu image upload cleanup');
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
      removeUploadedFile(req.file, req, 'Menu image upload cleanup');
      return res.status(404).json({ message: "메뉴를 찾을 수 없습니다." });
    }

    // 이미지 URL 생성 (웹에서 접근 가능한 경로)
    const imageUrl = `/uploads/menus/${req.file.filename}`;

    // 메뉴의 image_url 필드 업데이트
    const updatedMenu = await Menu.updateById(menuId, { image_url: imageUrl });
    
    if (!updatedMenu) {
      // 업데이트 실패 시 업로드된 파일 삭제
      removeUploadedFile(req.file, req, 'Menu image upload cleanup');
      return res.status(500).json({ message: "이미지 URL 업데이트에 실패했습니다." });
    }

    res.status(200).json({
      message: "이미지가 성공적으로 업로드되었습니다.",
      imageUrl: imageUrl,
      filename: req.file.filename,
      menuId: menuId
    });

  } catch (error) {
    logger.logError(error, req, { context: 'Menu image upload' });
    
    // 오류 발생 시 업로드된 파일 삭제
    removeUploadedFile(req.file, req, 'Menu image upload cleanup');

    res.status(500).json({
      message: "이미지 업로드 중 오류가 발생했습니다."
    });
  }
};
