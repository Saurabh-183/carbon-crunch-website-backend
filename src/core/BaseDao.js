/**
 * Base Data Access Object (DAO)
 * Provides common CRUD operations for all Mongoose models
 * Inspired by inspiration/src/baseDao pattern
 */

class BaseDao {
  constructor(model) {
    this.model = model;
  }

  /**
   * Find by ID
   */
  async findById(id, projection = {}) {
    return this.model.findById(id, projection).lean();
  }

  /**
   * Find one document
   */
  async findOne(query, projection = {}) {
    return this.model.findOne(query, projection).lean();
  }

  /**
   * Find multiple documents with pagination
   */
  async find(query, projection = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      lean = true,
    } = options;

    const skip = (page - 1) * limit;

    let queryBuilder = this.model
      .find(query, projection)
      .sort(sort)
      .skip(skip)
      .limit(limit);

    if (lean) {
      queryBuilder = queryBuilder.lean();
    }

    return queryBuilder;
  }

  /**
   * Find all documents (no pagination)
   */
  async findAll(query = {}, projection = {}) {
    return this.model.find(query, projection).lean();
  }

  /**
   * Count documents
   */
  async count(query = {}) {
    return this.model.countDocuments(query);
  }

  /**
   * Create new document
   */
  async create(data) {
    const doc = new this.model(data);
    return doc.save();
  }

  /**
   * Insert multiple documents
   */
  async insertMany(dataArray) {
    return this.model.insertMany(dataArray);
  }

  /**
   * Update one document
   */
  async updateOne(query, update, options = {}) {
    return this.model.updateOne(query, update, options);
  }

  /**
   * Update multiple documents
   */
  async updateMany(query, update, options = {}) {
    return this.model.updateMany(query, update, options);
  }

  /**
   * Find by ID and update
   */
  async findByIdAndUpdate(id, update, options = { new: true }) {
    return this.model.findByIdAndUpdate(id, update, options);
  }

  /**
   * Find one and update
   */
  async findOneAndUpdate(query, update, options = { new: true }) {
    return this.model.findOneAndUpdate(query, update, options);
  }

  /**
   * Soft delete (set isDeleted flag)
   */
  async softDelete(query) {
    return this.model.updateMany(query, {
      isDeleted: true,
      deletedAt: new Date(),
    });
  }

  /**
   * Hard delete
   */
  async deleteOne(query) {
    return this.model.deleteOne(query);
  }

  /**
   * Delete multiple documents
   */
  async deleteMany(query) {
    return this.model.deleteMany(query);
  }

  /**
   * Aggregate query
   */
  async aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }

  /**
   * Check if document exists
   */
  async exists(query) {
    const doc = await this.model.findOne(query).select("_id").lean();
    return !!doc;
  }

  /**
   * Populate references
   */
  async findWithPopulate(query, projection = {}, populateFields = []) {
    let queryBuilder = this.model.find(query, projection);

    populateFields.forEach((field) => {
      queryBuilder = queryBuilder.populate(field);
    });

    return queryBuilder.lean();
  }

  /**
   * Get paginated results with metadata
   */
  async paginate(query = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      projection = {},
    } = options;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model
        .find(query, projection)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }
}

/**
 * Factory function to create DAO instance
 * Usage: const userDao = createBaseDao(UserModel);
 */
const createBaseDao = (model) => {
  return new BaseDao(model);
};

export { BaseDao, createBaseDao };
