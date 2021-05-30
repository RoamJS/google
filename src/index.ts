import { toConfig, createPage } from "roam-client";

const CONFIG = toConfig("google");
createPage({ title: CONFIG });
