import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

@Injectable()
export class DatabaseReadinessService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async probe(): Promise<void> {
    if (!this.dataSource.isInitialized) throw new Error("not_initialized");
    await this.dataSource.query("SELECT 1");
  }
}
