import { Router } from "express";
import { loginUser, registerUser, logoutUser, refreshAccessToken } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const userRouter = Router()

userRouter.post('/register', upload.fields([
    {
        name: "avatar",
        maxCount: 1
    },
    {
        name: "coverImage",
        maxCount: 1,
    }
]), registerUser)

userRouter.post('/login',loginUser)

//secured routes
userRouter.post('/logout',verifyJWT,logoutUser)
userRouter.post('/refresh-token', refreshAccessToken)
export default userRouter