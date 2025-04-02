import { DataSource } from "typeorm";
import dotnet from 'dotenv';

dotnet.config();

export const AppDataSource = new DataSource({
    type: "mysql",
    host: "58.61.147.179",
    port: 58015,
    username: "root",
    password: "mYf-NaXD2-izkH!",
    database: "airi_main",
    synchronize: false,
    logging: false
});