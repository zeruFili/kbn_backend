import { AppDataSource } from "../config/data-source";
import { Blog } from "../entities/blog";
import { AppError } from "../middlewares/error.middleware";
import { CreateBlogDto, UpdateBlogDto } from "../validators/blog.dto";
import { generateSlug } from "../utils/slug.utils";
import { deleteFiles, syncAttachments } from "../utils/upload.utils";

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
    const slug = generateSlug(dto.title);
    await ensureUnique(dto.title, slug);
    return repo().save(repo().create({ ...dto, slug, author_id: adminId }));
  }

  async update(id: string, dto: UpdateBlogDto): Promise<Blog> {
    const blog = await this.findById(id);
    const previousImages = blog.featured_image;
    const title = dto.title ?? blog.title;
    const slug = dto.title !== undefined ? generateSlug(title) : blog.slug;
    await ensureUnique(title, slug, id);
    Object.assign(blog, dto, { slug });
    const saved = await repo().save(blog);
    syncAttachments(previousImages, saved.featured_image);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const blog = await this.findById(id);
    await repo().delete(id);
    deleteFiles(blog.featured_image ?? []);
  }
}

export const blogService = new BlogService();
