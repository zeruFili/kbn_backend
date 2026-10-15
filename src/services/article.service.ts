import { AppDataSource } from "../config/data-source";
import { Article } from "../entities/aricle";
import { Status } from "../enums/event.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { CreateArticleDto, UpdateArticleDto } from "../validators/article.dto";
import { generateSlug } from "../utils/slug.utils";
import { deleteFiles, syncAttachments } from "../utils/upload.utils";

const repo = () => AppDataSource.getRepository(Article);

async function ensureUnique(title: string, slug: string, id?: string): Promise<void> {
  const query = repo().createQueryBuilder("article")
    .where("(article.title = :title OR article.slug = :slug)", { title, slug });
  if (id) query.andWhere("article.id != :id", { id });
  if (await query.getOne()) throw new AppError(409, "Title or slug already exists");
}

export class ArticleService {
  async list(currentUser?: { id?: string; role?: UserRole }): Promise<Article[]> {
    const isAdmin = currentUser?.role === UserRole.Admin;
    const query = repo().createQueryBuilder("article")
      .leftJoinAndSelect("article.author", "author")
      .orderBy("article.publication_date", "DESC");

    if (!isAdmin) {
      query.andWhere("article.status = :status", { status: Status.PUBLISHED });
    }

    return query.getMany();
  }

  async findById(id: string): Promise<Article> {
    const article = await repo().findOne({
      where: { id },
      relations: { author: true },
    });
    if (!article) throw new AppError(404, "Article not found");
    return article;
  }

  async create(dto: CreateArticleDto, adminId: string): Promise<Article> {
    const slug = generateSlug(dto.title);
    await ensureUnique(dto.title, slug);
    const saved = await repo().save(repo().create({ ...dto, slug, author_id: adminId }));
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateArticleDto): Promise<Article> {
    const article = await this.findById(id);
    const previousImages = article.featured_image;
    const title = dto.title ?? article.title;
    const slug = dto.title !== undefined ? generateSlug(title) : article.slug;
    await ensureUnique(title, slug, id);
    Object.assign(article, dto, { slug });
    const saved = await repo().save(article);
    syncAttachments(previousImages, saved.featured_image);
    return this.findById(saved.id);
  }

  async remove(id: string): Promise<void> {
    const article = await this.findById(id);
    await repo().delete(id);
    deleteFiles(article.featured_image ?? []);
  }
}

export const articleService = new ArticleService();
