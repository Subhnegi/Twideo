import { Router } from "express";
import { loginUser, registerUser, logoutUser, refreshAccessToken ,changeCurrentPassword, getCurrentUser, updateAccountEmail, updateAccountFullName, updateAvatar, updateCover} from "../controllers/user.controller.js";
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
userRouter.post('/change-password',verifyJWT, changeCurrentPassword)
userRouter.get('/current-user',verifyJWT,getCurrentUser)
userRouter.post('/update-email',verifyJWT, updateAccountEmail)
userRouter.post('/update-fullname',verifyJWT, updateAccountFullName)
userRouter.post('/update-avatar',verifyJWT,upload.fields([{name:"avatar", maxCount:1}]), updateAvatar)
userRouter.post('/update-cover',verifyJWT,upload.fields([{name:"coverImage", maxCount:1}]), updateCover)
export default userRouter