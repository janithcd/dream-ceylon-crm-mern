# Part 40 Server Integration

Do not replace your complete `server.js` without comparing it to your current route list.

## 1. Install security packages

From the backend folder:

```powershell
npm install helmet express-rate-limit
```

`cors` is already used by the project. If it is missing:

```powershell
npm install cors
```

## 2. Add imports near the top of `backend/server.js`

```js
require("dotenv").config();

const {
    validateEnvironment,
} = require("./config/validateEnv");

const {
    applySecurityMiddleware,
} = require("./config/security");

const {
    notFound,
    errorHandler,
} = require("./middleware/errorMiddleware");

const healthRoutes = require("./routes/healthRoutes");
```

Keep all your existing route imports.

## 3. Validate the environment

Add after loading `.env` and before starting the server:

```js
validateEnvironment();
```

## 4. Apply security before routes

After:

```js
const app = express();
```

add:

```js
applySecurityMiddleware(app);

app.use(express.json({
    limit: "2mb",
}));

app.use(express.urlencoded({
    extended: true,
    limit: "2mb",
}));
```

Remove duplicate `cors()` middleware if `applySecurityMiddleware(app)` is used.

## 5. Mount the health route

```js
app.use("/api/health", healthRoutes);
```

## 6. Keep all existing route mounts

Example:

```js
app.use("/api/auth", authRoutes);
app.use("/api/admins", adminManagementRoutes);
app.use("/api/activity-logs", activityLogRoutes);
// Keep every other existing route.
```

## 7. Add error middleware last

After all routes:

```js
app.use(notFound);
app.use(errorHandler);
```

## 8. Recommended startup pattern

```js
const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
    try {
        validateEnvironment();

        await mongoose.connect(process.env.MONGO_URI);

        app.listen(PORT, () => {
            console.log(
                `Dream Ceylon CRM API running on port ${PORT}`
            );
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

startServer();
```

Do not connect to MongoDB twice.

## 9. Test

```powershell
npm run dev
```

Open:

```http
GET http://localhost:5000/api/health
```

Then rerun the Part 39 Postman collection.
