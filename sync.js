require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

// Configure dayjs plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Suppress console.log in production
// if (process.env.NODE_ENV === 'production') {
//     console.log = () => {};
// }

// MongoDB schemas
const LogSchema = new mongoose.Schema({
    time: { type: Date, required: true },
    metadata: {
        // status: Number,
        place_id: {
            type: Number,
            index: true
        },
    },
    measurements: {},
}, {
    timeseries: {
        timeField: 'time',
        metaField: 'metadata',
        granularity: 'minutes'
    },
    collection: 'data_logs',
});

const LastLogSchema = new mongoose.Schema({
    company_id: Number,
    place_id: {
        type: Number,
        required: true,
        index: { unique: true },
    },
    type_id: Number,
    factory_id: Number,
    time: { type: Date },
    data: {}
}, {
    collection: 'last_logs',
    autoCreate: true,
    autoIndex: true
});

const LastLog = mongoose.model('LastLog', LastLogSchema, 'last_logs');

const PlaceModel = mongoose.model('place',  new mongoose.Schema({
    type_id: Number,
    factory_id: Number,
    place_id: Number,
    name: String,
    folder: String,
}), 'em_places');

// Cache for place data
const placesCache = new Map();
let lastProcessedPlaceId = 0;

// Establish MongoDB connection
async function connectToMongoDB() {
    if (mongoose.connection.readyState === 1) {
        return; // Already connected
    }

    try {
        await mongoose.connect(process.env.SYNC_LOG_MONGODB, {
            serverSelectionTimeoutMS: 5000, // Thời gian chờ chọn server
            heartbeatFrequencyMS: 10000, // Kiểm tra trạng thái kết nối mỗi 10s
        });
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1);
    }
}

// Find all txt files in directory recursively
async function findTxtFiles(directory) {
    let results = [];

    try {
        const files = fs.readdirSync(directory, { withFileTypes: true });

        for (const file of files) {
            const fullPath = path.join(directory, file.name);

            if (file.isDirectory()) {
                // Recursive search in subdirectories
                const subDirFiles = await findTxtFiles(fullPath);
                results = results.concat(subDirFiles);
            } else if (file.isFile() && path.extname(file.name) === '.txt') {
                // Add .txt files to results
                results.push(fullPath);
            }
        }
    } catch (err) {
        console.log('File search error:', err.message);
    }

    return results;
}

// Split array into chunks of specified size
function chunkArray(array, size) {
    if (size <= 0) return [];

    const result = [];
    for (let i = 0; i < array.length; i += size) {
        result.push(array.slice(i, i + size));
    }
    return result;
}

// Initialize place in LastLog collection if not exists
async function initializeLastLog(place) {
    if (placesCache[place.id]) {
        return;
    }

    const exists = await LastLog.findOne({ place_id: place.id });

    if (!exists) {
        await LastLog.updateOne(
            { place_id: place.id },
            {
                place_id: place.id,
                type_id: place.type_id,
                company_id: place.company_id,
                factory_id: place.factory_id,
                time: new Date("2000-02-24T03:15:00Z"),
            },
            { upsert: true }
        );
    }
}

async function isFileStable(filePath, checkInterval = 1000, maxAttempts = 10) {
    try {
        let lastSize = -1;
        for (let i = 0; i < maxAttempts; i++) {
            const stats = fs.statSync(filePath);
            const currentSize = stats.size;
            // console.log(`Kiểm tra ${filePath}: kích thước = ${currentSize} bytes (lần ${i + 1})`);

            if (lastSize === currentSize && lastSize !== -1) {
                console.log(`File ${filePath} ổn định, sẵn sàng đọc`);
                return true;
            }
            lastSize = currentSize;
            await (new Promise(resolve => setTimeout(resolve, checkInterval)));
        }
        console.warn(`File ${filePath} không ổn định sau ${maxAttempts} lần kiểm tra`);
        return false;
    } catch (err) {
        console.error(`Lỗi khi kiểm tra file ${filePath}: ${err.message}`);
        return false;
    }
}

// Extract measurements from file content
async function extractMeasurementsByTime(filePath) {
    const isStable = await isFileStable(filePath);
    if (!isStable) {
        console.warn(`File ${filePath} chưa sẵn sàng, bỏ qua`);
        throw Error('File không có nội dung');
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const groupedData = {};

    for (const line of lines) {
        const columns = line.split('\t');

        if (!columns[4]) {
            continue;
        }

        const timestamp = columns[3];
        if (!groupedData[timestamp]) {
            groupedData[timestamp] = {};
        }

        groupedData[timestamp][columns[0]] = {
            number: Number(columns[1]),
            unit: columns[2],
            status: Number(columns[4]),
        };
    }

    if (!Object.keys(groupedData).length) {
        console.log('content', content);
        throw Error('File không có nội dung');
    }

    return groupedData;
}

// Insert single data point
async function insertLogEntry(place, entry) {
    const Log = mongoose.model('data_logs', LogSchema);

    // for (const item of entry.batch) {
    //     const res = await (new Log(item)).save();
    //     console.log('insert', place.id, res?._id);
    // }
    for (const item of entry.batch) {
        const exists = await Log.exists({
            time: item.time,
            'metadata.place_id': item.metadata.place_id
        });

        if (exists) {
            console.log(`❌ Bỏ qua vì đã tồn tại: place_id = ${item.metadata.place_id}, time = ${item.time}`);
            // ❗ XÓA file nếu đã tồn tại
            try {
                fs.unlinkSync(entry.file);
                console.log(`🗑️ Đã xóa file: ${entry.file}`);
            } catch (err) {
                console.error(`❌ Không thể xóa file: ${entry.file}`, err);
            }
            return; // không insert nữa
        }

        try {
            const res = await (new Log(item)).save();
            console.log('✅ insert', place.id, res?._id);
        } catch (err) {
            console.error('❌ Insert error:', err);
        }
    }
    // Move file đã insert vào thư mục lưu trữ
    if (entry.batch.length > 1) {
        await moveToError(entry.file);
    }
    if (entry.batch.length === 1) {
        await moveToArchive(entry.file);
    }
}

// Process multiple files and insert data
async function processFiles(place, files) {
    try {
        // Process all files asynchronously
        const results = await Promise.all(files.map(async (file) => {
            const data = await extractMeasurementsByTime(file);
            const batch = [];

            for (const timestamp in data) {
                const newData = {
                    time: dayjs.tz(timestamp, 'Asia/Ho_Chi_Minh').utc().toDate(),
                    metadata: {
                        place_id: place.id
                    },
                    measurements: data[timestamp]
                };

                batch.push(newData);
            }
            return {
                file,
                batch
            };
        }));

        console.log('allEntries', results.length);

        // Insert all entries
        await Promise.all(results.map(entry => insertLogEntry(place, entry)));
    } catch (e) {
        console.error('Processing error:', e);
    }
}

// Update the latest log for a place
async function updateLatestLogForPlace(place, newData) {
    const filter = {
        place_id: place.id,
        time: { $lt: newData.time }
    };

    const update = {
        $set: {
            data: newData.measurements,
            time: newData.time
        }
    };

    await LastLog.updateOne(filter, update);
}


async function moveToArchive(file) {
    return moveFile(file, file.replace(process.env.SYNC_LOG_DIR, process.env.SYNC_LOG_DIR_MOVE));
}

async function moveToError(file) {
    return moveFile(file, file.replace(process.env.SYNC_LOG_DIR, process.env.SYNC_LOG_DIR_ERROR));
}

// Move a single file
async function moveFile(sourcePath, destPath) {
    try {
        const destDir = path.dirname(destPath);
        fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(sourcePath, destPath);
        console.log('File moved successfully');
    } catch (error) {
        console.error('Error moving file:', error);
    }
}

async function fetchListPlace() {
    try {
        await connectToMongoDB();

        const rows = await PlaceModel.find({});

        if (rows.length > 0) {
            lastProcessedPlaceId = rows[rows.length - 1].place_id;
            placesCache.clear();
            for (const row of rows) {
                const place = JSON.parse(JSON.stringify(row));
                place.id = place.place_id;
                placesCache.set(place.place_id, place);
            }
        }
    } catch (error) {
        console.error('Error fetching places:', error);
    }
}
// Fetch places from MySQL periodically
setInterval(async () => {
    await fetchListPlace()
}, 15000);

// Main processing function
async function main() {
    await connectToMongoDB();

    for (const place of placesCache.values()) {
        const directory = process.env.SYNC_LOG_DIR + place.folder;

        // Initialize LastLog entry if not exists
        // await initializeLastLog(place);

        // Find all text files for this place
        const files = await findTxtFiles(directory);

        // Skip if no files found
        if (!files.length) {
            continue;
        }

        // Process the most recent file immediately
        await processFiles(place, [files.pop()]);

        // Process remaining files in chunks
        if (files.length) {
            const chunkedFiles = chunkArray(files, 500);
            for (const chunk of chunkedFiles) {
                await processFiles(place, chunk);
            }
        }
    }


    // Continue checking for new files
    setTimeout(() => {
        main();
    }, 200);
}

fetchListPlace().then(() => {
    // Start the process
    main();
})