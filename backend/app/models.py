
from typing import Literal, Optional, List, Dict
from pydantic import BaseModel, EmailStr, Field


Role = Literal["owner", "editor", "viewer"]
ShareLinkRole = Literal["editor", "viewer"]
AIAction = Literal["rewrite", "summarize", "translate"]


class ErrorBody(BaseModel):
    code: int
    message: str
    detail: Optional[str] = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=8)


class RegisterResponse(BaseModel):
    user_id: str
    name: str
    email: EmailStr
    created_at: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user_id: str
    name: str


class UserRecord(BaseModel):
    user_id: str
    name: str
    email: EmailStr
    password_hash: str
    created_at: str


class CreateDocumentRequest(BaseModel):
    title: str = Field(min_length=1)


class CreateDocumentResponse(BaseModel):
    document_id: str
    title: str
    owner_id: str
    created_at: str
    updated_at: str
    version: int


class DeleteDocumentResponse(BaseModel):
    document_id: str
    deleted_at: str


class CollaboratorEntry(BaseModel):
    user_id: str
    role: Role
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class GetDocumentResponse(BaseModel):
    document_id: str
    title: str
    content: str
    owner_id: str
    current_role: Role
    version: int
    updated_at: str
    collaborators: List[CollaboratorEntry]


class UpdateDocumentRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    base_version: Optional[int] = None


class UpdateDocumentResponse(BaseModel):
    document_id: str
    title: str
    version: int
    updated_at: str


class DocumentListItem(BaseModel):
    document_id: str
    title: str
    role: Role
    updated_at: str


class ListDocumentsResponse(BaseModel):
    documents: List[DocumentListItem]


class ShareDocumentRequest(BaseModel):
    user_email: EmailStr
    role: Role


class ShareDocumentResponse(BaseModel):
    document_id: str
    user_id: str
    role: Role
    granted_at: str


class ShareLinkCreateRequest(BaseModel):
    role: ShareLinkRole
    expires_in_hours: Optional[int] = Field(default=None, ge=1, le=168)


class ShareLinkEntry(BaseModel):
    token: str
    role: ShareLinkRole
    created_at: str
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None
    redeemed_count: int
    is_active: bool


class CreateShareLinkResponse(ShareLinkEntry):
    document_id: str


class ListShareLinksResponse(BaseModel):
    links: List[ShareLinkEntry]


class ShareLinkPreviewResponse(BaseModel):
    token: str
    document_id: str
    title: str
    role: ShareLinkRole
    expires_at: Optional[str] = None
    revoked_at: Optional[str] = None
    is_active: bool


class RedeemShareLinkResponse(BaseModel):
    document_id: str
    title: str
    role: Role
    redeemed_at: str


class VersionEntry(BaseModel):
    version: int
    title: str
    content: str
    saved_at: str


class ListVersionsResponse(BaseModel):
    versions: List[VersionEntry]


class RestoreVersionResponse(BaseModel):
    document_id: str
    version: int
    updated_at: str


class AIOptions(BaseModel):
    tone: Optional[str] = None
    target_language: Optional[str] = None


class AIGenerateRequest(BaseModel):
    selected_text: str = Field(min_length=1)
    action: AIAction = "rewrite"
    options: AIOptions = Field(default_factory=AIOptions)


class AIRewriteRequest(BaseModel):
    text: str = Field(min_length=1)
