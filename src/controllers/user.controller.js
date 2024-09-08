import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/apiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import unlink from '../utils/unlinkfile.js'
const registerUser = asyncHandler(async (req, res) => {
    // check for images , check for avatar

    let avatarLocalPath
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        avatarLocalPath = req.files?.avatar[0]?.path
    }
    let coverImageLocalPath
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path;
    }
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    // get user details from frontend
    const { fullName, email, username, password } = req.body
    // validations - not empty
    if (
        [fullName, email, username, password].some((field) =>
            !field || field.trim() === "")
    ) {
        unlink(avatarLocalPath)
        unlink(coverImageLocalPath)
        throw new ApiError(400, "All fields are required")
    }
    // check if user is already registered username and email
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) 
        {
            unlink(avatarLocalPath)
        unlink(coverImageLocalPath)
        throw new ApiError(409, "User with email already registered")
    }

    // upload them to cloudinary , avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
    // create user object - create entry in db 
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })
    //remove password and refresh token field  from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    // check for user creation
    if (!createdUser) {
        unlink(avatarLocalPath)
        unlink(coverImageLocalPath)
        throw new ApiError(500, "Something went wrong while creating the user")
    }
    // return response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "user registed successfully")
    )
})

export { registerUser }