#!/usr/bin/env node

import 'dotenv/config';
import clc from 'cli-color';
import path from 'path';
import {once} from 'events';
import fs, {createReadStream} from 'fs';
import {readFile} from 'fs/promises';
import {createInterface} from 'readline';
import admin from "firebase-admin";
import {Command} from 'commander';
import {Vec} from '@nyinyithann/vec.js';

import Configstore from 'configstore';

const info = clc.blue.bgBlack;
const success = clc.green.bgBlack;
const warn = clc.yellow.bgBlack;
const error = clc.red.bgBlack;
const logI = (msg) => console.log(info(msg));
const logS = (msg) => console.log(success(msg));
const logW = (msg) => console.log(warn(msg));
const logE = (msg) => console.log(error(msg));

async function getLessonsFromFile(filePath) {
    filePath = path.join(path.resolve(), filePath);
    const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity
    });

    const lessons = [];
    let index = 0;
    let category, title;
    rl.on('line', (line) => {
        if (line !== '') {
            if (line.startsWith("#")) {
                [category, title] = line.slice(1).split("|");
                category = category.trim();
                title = title ? title.trim() : '';
            } else {
                const bonusPoints = category.startsWith("1") || category.startsWith("2")
                    ? 30 : line.trim().length;
                lessons.push({
                    id: index++,
                    type: "default",
                    category,
                    title,
                    content: line.trim(),
                    bonusPoints
                });
            }
        }
    });

    await once(rl, 'close');
    return lessons;
}

async function writeLessons(db, lessons) {
    const deleteBatch = db.batch();
    logI("deleting lessons collection...");
    db.collection("lessons").listDocuments().then(docs => {
        docs.map(doc => deleteBatch.delete(doc));
        deleteBatch.commit();
    })

    logI("Uploading lessons to firestore...");
    const writeBatch = db.batch();
    for (let l of lessons) {
        const docRef = db.collection("lessons").doc();
        writeBatch.set(docRef, l);
    }
    return writeBatch.commit();
}

function saveUploadedLessonCount(count) {
    const packageJson = JSON.parse(fs.readFileSync("./package.json", 'utf8'));
    const config = new Configstore(packageJson.name);
    config.set("uploadedLessonCount", count);
}


function readUploadedLessonCount() {
    const packageJson = JSON.parse(fs.readFileSync("./package.json", 'utf8'));
    const config = new Configstore(packageJson.name);
    return config.get("uploadedLessonCount");
}

async function writeConfigs(db, configs) {
    console.table(configs);
    await db.collection("configs").doc("configs_id").set(configs);
}

function initializeFireBase() {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.PROJECT_ID,
            privateKey: process.env.PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.CLIENT_EMAIL,
        })
    });

    return admin.firestore();
}

function setEmulator(isSet) {
    if (isSet) {
        process.env['FIRESTORE_EMULATOR_HOST'] = "localhost:8080";
    }
}

const program = new Command();
program
    .name("tpadmin")
    .description("TypingChild Admin app to upload data to firestore.")
    .version("1.0.0");

program.command("uploadLessons")
    .description("Upload lessons from the json file to firestore.")
    .option("-e, --emulator <boolean>", "Run in emulator")
    .option("-f, --filePath <string>", "Lesson file path", './data/lessons.txt')
    .action(async (options) => {
        try {
            setEmulator(!!options.emulator);
            const db = initializeFireBase();
            logI(`Reding lessons from ${options.filePath}`);
            const lessons = await getLessonsFromFile(options.filePath);
            logS("All lessons are successfully read.");

            await writeLessons(db, lessons);
            saveUploadedLessonCount(lessons.length);
            logS("All lessons are uploaded successfully. Total lessons: " + lessons.length);
        } catch (e) {
            logE(e);
        }
    });

program.command("updateConfig")
    .description("Update config document in firestore.")
    .option("-e, --emulator <boolean>", "Run in emulator")
    .option("-d, --downloadAll <boolean>", "Fore clients to download all lessons.")
    .option("--totalLessonCount <number>", "Total count of all lessons", -1)
    .option("--newLessonIds <string>", "New lessons in firestore", "")
    .action((options) => {
        try {
            setEmulator(!!options.emulator);
            const db = initializeFireBase();
            const totalLessonCount = options.totalLessonCount === -1 ? readUploadedLessonCount() : options.totalLessonCount;
            const newLessonIds = options.newLessonIds.split(",").map(x => Number(x));

            const configs = {
                downloadAll: options.downloadAll === "true" ? true : false,
                totalLessonCount,
                newLessonIds,
            }
            writeConfigs(db, configs);
        } catch (e) {
            logE(e);
        }
    });

async function getWordsFromFile() {
    const filePath = path.join(path.resolve(), './data/words.txt');
    const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity
    });

    const words = Vec.empty();
    rl.on('line', (l) => {
        const line = l.trim();
        if (line !== '' && line.length > 2) {
            words.push(line);
        }
    });

    await once(rl, 'close'); words.sort();
    return words;
}

program.command("words")
    .description("Display words in A-Z order")
    .action(async (options) => {
        try {
            const words = await getWordsFromFile();
            words.sort((x, y) => x.length - y.length);
            for (let i = 97; i < 122; i++) {
                const alphabet = String.fromCharCode(i);
                const wordStartedWithAlphabet = words.filter(x => x.startsWith(alphabet));
                const groups = wordStartedWithAlphabet.groupBy(x => x.length);
                logI(`\n#Words | ${alphabet.toUpperCase()}`);
                for (const [key, values] of groups) {
                    if (key > 8) continue;
                    let count = 6
                    let end = count;
                    let start = 0;
                    let rowCount = 0;
                    let lesson = "";
                    while (start < values.length) {
                        if (rowCount++ === 12) break;
                        const row = values.slice(start, end).reduce((acc, x) => `${acc} ${x[0].toUpperCase()}${x.slice(1)}`, '');
                        lesson = `${lesson ? `${lesson}<br/>` : ''}${row.trim()}`;
                        start = start + count;
                        end = end + count;
                    }
                    logI(`${lesson}`);
                }
            }
        } catch (e) {
            logE(e);
        }
    });

program.parse();


