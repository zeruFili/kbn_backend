import { AppDataSource } from "../config/data-source";
import { Article } from "../entities/aricle";
import { AppError } from "../middlewares/error.middleware";
import { CreateArticleDto, UpdateArticleDto } from "../validators/article.dto";
import { generateSlug } from "../utils/slug.utils";
import { deleteFile } from "../utils/upload.utils";

const repo = () => AppDataSource.getRepository(Article);

async function ensureUnique(title: string, slug: string, id?: string): Promise<void> {
  const query = repo().createQueryBuilder("article")
    .where("(article.title = :title OR article.slug = :slug)", { title, slug });
  if (id) query.andWhere("article.id != :id", { id });
  if (await query.getOne()) throw new AppError(409, "Title or slug already exists");
}

export class ArticleService {
  list(): Promise<Article[]> {
    return repo().find({ order: { created_at: "DESC" } });
  }

  async findById(id: string): Promise<Article> {
    const article = await repo().findOne({ where: { id } });
    if (!article) throw new AppError(404, "Article not found");
    return article;
  }

  async create(dto: CreateArticleDto, adminId: string): Promise<Article> {
    const slug = generateSlug(dto.title);
    await ensureUnique(dto.title, slug);
    return repo().save(repo().create({ ...dto, slug, author_id: adminId }));
  }

  async update(id: string, dto: UpdateArticleDto): Promise<Article> {
    const article = await this.findById(id);
    const previousImage = article.featured_image;
    const title = dto.title ?? article.title;
    const slug = dto.title !== undefined ? generateSlug(title) : article.slug;
    await ensureUnique(title, slug, id);
    Object.assign(article, dto, { slug });
    const saved = await repo().save(article);
    if (previousImage && previousImage !== saved.featured_image) {
      deleteFile(previousImage);
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    const article = await this.findById(id);
    await repo().delete(id);
    if (article.featured_image) {
      deleteFile(article.featured_image);
    }
  }
}

export const articleService = new ArticleService();
