import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";
import {
  CommunityAuthSessionEntity,
  CommunityInstanceOwnerEntity,
} from "../entities/community-auth.entities.js";
import type {
  CommunityAuthRepository,
  CreateCommunityAuthSessionInput,
} from "./community-auth.repository.js";

export class TypeOrmCommunityAuthRepository implements CommunityAuthRepository {
  constructor(private readonly dataSource: DataSource) {}

  async ensureOwner(createdAt: Date): Promise<string> {
    const ownerUserId = randomUUID();
    await this.dataSource.query(
      `INSERT INTO community_instance_owner (installation_key, owner_user_id, created_at)
       VALUES (true, $1, $2)
       ON CONFLICT (installation_key) DO NOTHING`,
      [ownerUserId, createdAt],
    );
    const entity = await this.dataSource
      .getRepository(CommunityInstanceOwnerEntity)
      .findOneBy({ installationKey: true });
    if (entity === null)
      throw new Error("community_owner_initialization_failed");
    return entity.ownerUserId;
  }

  async createSession(input: CreateCommunityAuthSessionInput): Promise<void> {
    await this.dataSource.getRepository(CommunityAuthSessionEntity).insert({
      sessionHash: input.sessionHash,
      ownerUserId: input.ownerUserId,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
  }

  async findActiveSession(sessionHash: string, now: Date) {
    const entity = await this.dataSource
      .getRepository(CommunityAuthSessionEntity)
      .createQueryBuilder("session")
      .where("session.sessionHash = :sessionHash", { sessionHash })
      .andWhere("session.revokedAt IS NULL")
      .andWhere("session.expiresAt > :now", { now })
      .getOne();
    return entity === null
      ? null
      : { ownerUserId: entity.ownerUserId, expiresAt: entity.expiresAt };
  }

  async revokeSession(sessionHash: string, revokedAt: Date): Promise<void> {
    await this.dataSource
      .getRepository(CommunityAuthSessionEntity)
      .createQueryBuilder()
      .update()
      .set({ revokedAt })
      .where("session_hash = :sessionHash", { sessionHash })
      .andWhere("revoked_at IS NULL")
      .execute();
  }
}
