import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import unlink from '../utils/unlinkfile.js'
import jwt from "jsonwebtoken"
import mongoose from 'mongoose'

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId)
        const refreshToken = await user.generateRefreshToken();
        const accessToken = await user.generateAccessToken();
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false })
        return { refreshToken, accessToken }
    } catch (error) {
        throw new ApiError(500, "something went wrong while generating access and refresh tokens")
    }
}

const registerUser = asyncHandler(async (req, res) => {
    // check for images , check for avatar
    let avatarLocalPath
    if (req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0) {
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

    if (existedUser) {
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
const loginUser = asyncHandler(async (req, res) => {
    // take username or email from request. body
    const { username, email, password } = req.body
    if (!(username || email)) {
        throw new ApiError(403, "username or email is required")
    }
    // check if user exists
    const user = await User.findOne(
        {
            $or: [{ username }, { email }]
        }
    )
    if (!user) {
        throw new ApiError(404, "User not found")
    }
    // check password
    if (!await user.isPasswordCorrect(password)) {
        throw new ApiError(401, "Password incorrect")
    }
    // generate access token and refresh token
    const { refreshToken, accessToken } = await generateAccessAndRefreshToken(user._id)
    // remove unwanted fields from user
    const loggedUser = await User.findById(user._id).select("-password -refreshToken")
    // send tokens in cookies

    const options = {
        httpOnly: true,
        // secure: true,
    }
    return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedUser,
                    accessToken,
                    refreshToken
                },
                'user logged in successfully'
            )
        )
})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: { refreshToken: undefined }
        },
        {
            new: true,
        }
    )
    const options = {
        httpOnly: true,
        // secure: true, 
    }
    return res.status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "user logged out successfully")
        )

})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incommingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incommingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }
    try {
        const decodedToken = jwt.verify(incommingRefreshToken, process.env.REFRESH_TOKEN_SECRET)

        const user = await User.findById(decodedToken?._id)
        if (!user) {
            throw new ApiError(401, "invalid refresh token")
        }

        if (incommingRefreshToken !== user.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }

        const options = {
            httpOnly: true,
            secure: true,
        }
        const { accessToken, newRefreshToken } = await generateAccessAndRefreshToken(user._id)
        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, newRefreshToken },
                    "Access token refreshed",
                )
            )
    } catch (error) {
        throw new ApiError(401, error.message || "invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body
    const user = await User.findById(req.user._id)
    const isPasswordCorrect = await user.isPasswordCorrect(currentPassword)
    if (!isPasswordCorrect) {
        throw new ApiError(400, "wrong password")
    }
    user.password = newPassword;
    await user.save({ validateBeforeSave: false })
    return res.status(200)
        .json(
            new ApiResponse(200,
                {},
                "password updated successfully"
            )
        )
})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(new ApiResponse(
        200, req.user, "user retrieved successfully"
    ))
})

const updateAccountEmail = asyncHandler(async (req, res) => {
    const { email } = req.body
    if (!email) {
        throw new ApiError(400, "email is required");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: { email }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, user, "email updated successfully"))
})

const updateAccountFullName = asyncHandler(async (req, res) => {
    const { fullName } = req.body
    if (!fullName) {
        throw new ApiError(400, "full name is required");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: { fullName }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, user, "full name updated successfully"))
})

const updateAvatar = asyncHandler(async (req, res) => {
    let localAvatar
    if (req.files && Array.isArray(req.files.avatar) && req.files.avatar.length > 0) {
        localAvatar = req.files?.avatar[0]?.path
    }
    if (!localAvatar) {
        throw new ApiError(400, "avatar file is required");
    }
    const avatar = await uploadOnCloudinary(localAvatar)
    if (!avatar.url) {
        throw new ApiError(400, "avatar file is missing");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: { avatar: avatar.url }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully"))
})
const updateCover = asyncHandler(async (req, res) => {
    let localCover
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        localCover = req.files?.coverImage[0]?.path
    }
    if (!localCover) {
        unlink(localCover)
        throw new ApiError(400, "cover image file is required");
    }
    const cover = await uploadOnCloudinary(localCover)
    if (!cover.url) {
        throw new ApiError(400, "cover file is missing");
    }

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: { coverImage: cover.url }
        },
        {
            new: true
        }
    ).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, user, "Cover image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params

    if (!username) { throw new ApiError(400, "username is missing") }

    const channel = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subcribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: { $in: [req.user._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subcribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if (channel?.length) {
        throw new ApiError(404, "channel does not exist")
    }

    return res.status(200).json(
        new ApiResponse(200, channel[0], "users channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate(
        [
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(req.user._id)
                }
            },
            {
                $lookup: {
                    from: "videos",
                    localField: "watchHistory",
                    foreignField: "_id",
                    as: "watchHistory",
                    pipeline: [
                        {
                            $lookup: {
                                from: "users",
                                localField: "owner",
                                foreignField: "_id",
                                as: "owner",
                                pipeline: [
                                    {
                                        $project: {
                                            fullName: 1,
                                            username: 1,
                                            avatar: 1
                                        }
                                    }
                                ]
                            }
                        },
                        {
                            $addFields: {
                                owner: {
                                    $first: "$owner"
                                }
                            }
                        }
                    ]
                },

            }
        ]
    )

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                user[0].watchHistory,
                "watchHistory fetched successfully"
            )
        )
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountEmail, updateAccountFullName, updateAvatar, updateCover, getUserChannelProfile, getWatchHistory } 