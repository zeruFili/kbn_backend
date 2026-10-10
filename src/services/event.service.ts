import { AppDataSource } from "../config/data-source";
import { Event } from "../entities/event";
import { AppError } from "../middlewares/error.middleware";
import { CreateEventDto, UpdateEventDto } from "../validators/event.dto";

const repo = () => AppDataSource.getRepository(Event);

async function ensureUnique(title: string, slug: string, id?: string): Promise<void> {
  const query = repo().createQueryBuilder("event")
    .where("(event.title = :title OR event.slug = :slug)", { title, slug });
  if (id) query.andWhere("event.id != :id", { id });
  if (await query.getOne()) throw new AppError(409, "Title or slug already exists");
}

export class EventService {
  list(): Promise<Event[]> {
    return repo().find({ order: { created_at: "DESC" } });
  }

  async findById(id: string): Promise<Event> {
    const event = await repo().findOne({ where: { id } });
    if (!event) throw new AppError(404, "Event not found");
    return event;
  }

  async create(dto: CreateEventDto, adminId: string): Promise<Event> {
    await ensureUnique(dto.title, dto.slug);
    return repo().save(repo().create({ ...dto, created_by: adminId }));
  }

  async update(id: string, dto: UpdateEventDto): Promise<Event> {
    const event = await this.findById(id);
    await ensureUnique(dto.title ?? event.title, dto.slug ?? event.slug, id);
    Object.assign(event, dto);
    return repo().save(event);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await repo().delete(id);
  }
}

export const eventService = new EventService();
