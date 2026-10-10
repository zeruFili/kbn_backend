import { AppDataSource } from "../config/data-source";
import { Blog } from "../entities/blog";
import { AppError } from "../middlewares/error.middleware";
import { CreateBlogDto, UpdateBlogDto } from "../validators/blog.dto";

const repo = () => AppDataSource.getRepository(Blog);

async function ensureUnique(title: string, slug: string, id?: string): Promise<void> {
  const query = repo().createQueryBuilder("blog")
    .where("(blog.title = :title OR blog.slug = :slug)", { title, slug });
  if (id) query.andWhere("blog.id != :id", { id });
  if (await query.getOne()) throw new AppError(409, "Title or slug already exists");
}

export class BlogService {
  list(): Promise<Blog[]> {
    return repo().find({ order: { created_at: "DESC" } });
  }

  async findById(id: string): Promise<Blog> {
    const blog = await repo().findOne({ where: { id } });
    if (!blog) throw new AppError(404, "Blog not found");
    return blog;
  }

  async create(dto: CreateBlogDto, adminId: string): Promise<Blog> {
    await ensureUnique(dto.title, dto.slug);
    return repo().save(repo().create({ ...dto, author_id: adminId }));
  }

  async update(id: string, dto: UpdateBlogDto): Promise<Blog> {
    const blog = await this.findById(id);
    await ensureUnique(dto.title ?? blog.title, dto.slug ?? blog.slug, id);
    Object.assign(blog, dto);
    return repo().save(blog);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await repo().delete(id);
  }
}

export const blogService = new BlogService();
