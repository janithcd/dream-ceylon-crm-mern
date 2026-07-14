const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        password: {
            type: String,
            required: true,
            minlength: 8,
        },

        role: {
            type: String,
            enum: [
                "Super Admin",
                "Manager",
                "Sales",
                "Finance",
                "Viewer",
            ],
            default: "Super Admin",
            index: true,
        },

        status: {
            type: String,
            enum: ["Active", "Inactive"],
            default: "Active",
            index: true,
        },

        customPermissions: {
            type: [String],
            default: [],
        },

        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

adminSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

adminSchema.methods.matchPassword = async function (enteredPassword) {
    return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);