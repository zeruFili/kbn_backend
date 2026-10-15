import { AppDataSource } from "../config/data-source";
import { Event } from "../entities/event";
import { Status } from "../enums/event.enum";
import { UserRole } from "../enums/user-role.enum";
import { AppError } from "../middlewares/error.middleware";
import { CreateEventDto, UpdateEventDto } from "../validators/event.dto";
import { generateSlug } from "../utils/slug.utils";
import { deleteFile } from "../utils/upload.utils";

const repo = () => AppDataSource.getRepository(Event);

async function ensureUnique(title: string, slug: string, id?: string): Promise<void> {
  const query = repo().createQueryBuilder("event")
    .where("(event.title = :title OR event.slug = :slug)", { title, slug });
  if (id) query.andWhere("event.id != :id", { id });
  if (await query.getOne()) throw new AppError(409, "Title or slug already exists");
}

export class EventService {
  async list(currentUser?: { id?: string; role?: UserRole }): Promise<Event[]> {
    const isAdmin = currentUser?.role === UserRole.Admin;
    const query = repo().createQueryBuilder("event")
      .orderBy("event.start_date", "ASC");

    if (!isAdmin) {
      query.andWhere("event.status = :status", { status: Status.PUBLISHED });
    }

    return query.getMany();
  }

  async findById(id: string): Promise<Event> {
    const event = await repo().findOne({ where: { id } });
    if (!event) throw new AppError(404, "Event not found");
    return event;
  }

  async create(dto: CreateEventDto, adminId: string): Promise<Event> {
    const slug = generateSlug(dto.title);
    await ensureUnique(dto.title, slug);
    return repo().save(repo().create({ ...dto, slug, created_by: adminId }));
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findById(id);
    const previousImages = event.images ?? [];
    const title = dto.title ?? event.title;
    const slug = dto.title !== undefined ? generateSlug(title) : event.slug;
    await ensureUnique(title, slug, id);
    Object.assign(event, dto, { slug });
    const saved = await repo().save(event);
    const currentImages = new Set(saved.images ?? []);
    for (const image of previousImages) {
      if (!currentImages.has(image)) {
        deleteFile(image);
      }
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    const event = await this.findById(id);
    await repo().delete(id);
    for (const image of event.images ?? []) {
      deleteFile(image);
    }
  }
}

export const eventService = new EventService();
