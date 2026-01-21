#version 410 core

in vec3 fPosition;
in vec3 fNormal;
in vec2 fTexCoords;

out vec4 fColor;

// Matrices
uniform mat4 model;
uniform mat4 view;
uniform mat3 normalMatrix;

// Lighting Uniforms
uniform vec3 lightDir;      // Directional Light
uniform vec3 lightColor;
uniform vec3 pointLightPos; // Point Light (World Space)

// Texture Uniforms
uniform sampler2D diffuseTexture;
uniform sampler2D specularTexture;

// Lighting Constants
vec3 ambient;
vec3 diffuse;
vec3 specular;
float ambientStrength = 0.2f;
float specularStrength = 0.5f;
float shininess = 32.0f;

// Attenuation Constants (hardcoded for distance ~50 units)
float constant = 1.0f;
float linear = 0.09f;
float quadratic = 0.032f;

void computeDirLight()
{
    // 1. Get positions in Eye Space
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    vec3 normalEye = normalize(normalMatrix * fNormal);
    vec3 viewDir = normalize(-fPosEye.xyz);

    // 2. Directional Light Logic
    vec3 lightDirN = vec3(normalize(view * vec4(lightDir, 0.0f)));

    // Ambient
    ambient += ambientStrength * lightColor;

    // Diffuse
    float diff = max(dot(normalEye, lightDirN), 0.0f);
    diffuse += diff * lightColor;

    // Specular
    vec3 reflectDir = reflect(-lightDirN, normalEye);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0f), shininess);
    specular += specularStrength * spec * lightColor;
}

void computePointLight()
{
    // 1. Get positions in Eye Space
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    vec3 normalEye = normalize(normalMatrix * fNormal);
    vec3 viewDir = normalize(-fPosEye.xyz);

    // 2. Point Light Logic
    // Transform point light position to View Space
    vec4 lightPosEye = view * vec4(pointLightPos, 1.0f);
    vec3 lightDirN = normalize(lightPosEye.xyz - fPosEye.xyz);

    // Attenuation (Distance Fade)
    float dist = length(lightPosEye.xyz - fPosEye.xyz);
    float att = 1.0 / (constant + linear * dist + quadratic * (dist * dist));

    // Ambient
    ambient += (ambientStrength * lightColor) * att;

    // Diffuse
    float diff = max(dot(normalEye, lightDirN), 0.0f);
    diffuse += (diff * lightColor) * att;

    // Specular
    vec3 reflectDir = reflect(-lightDirN, normalEye);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0f), shininess);
    specular += (specularStrength * spec * lightColor) * att;
}

void computeSpotLight()
{
    // 1. Get positions in Eye Space
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    vec3 normalEye = normalize(normalMatrix * fNormal);
    vec3 viewDir = normalize(-fPosEye.xyz);

    // 2. Spot Light Logic (Flashlight)
    // In Eye Space, camera is at (0,0,0) and looks down -Z (0,0,-1)
    vec3 lightPosEye = vec3(0.0f, 0.0f, 0.0f); // Camera Position
    vec3 spotDir = vec3(0.0f, 0.0f, -1.0f);    // Camera Front
    
    vec3 lightDirN = normalize(lightPosEye - fPosEye.xyz);
    
    // Cutoff logic (Cosines of 12.5 and 17.5 degrees)
    float cutOff = 0.976f;      
    float outerCutOff = 0.953f; 

    float theta = dot(lightDirN, normalize(-spotDir)); 
    float epsilon = cutOff - outerCutOff;
    float intensity = clamp((theta - outerCutOff) / epsilon, 0.0, 1.0);

    // Attenuation
    float dist = length(lightPosEye - fPosEye.xyz);
    float att = 1.0 / (constant + linear * dist + quadratic * (dist * dist));

    // Apply Flashlight (White Color)
    ambient += (ambientStrength * vec3(1.0f)) * att * intensity;
    diffuse += (intensity * att) * max(dot(normalEye, lightDirN), 0.0f) * vec3(1.0f);
    
    vec3 reflectDir = reflect(-lightDirN, normalEye);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0f), shininess);
    specular += (intensity * att * specularStrength) * spec * vec3(1.0f);
}

void main() 
{
    // Reset colors
    ambient = vec3(0.0f);
    diffuse = vec3(0.0f);
    specular = vec3(0.0f);

    // Sum up all lights
    computeDirLight();
    computePointLight();
    computeSpotLight();

    // Combine with texture
    vec3 texDiffuse = texture(diffuseTexture, fTexCoords).rgb;
    vec3 texSpecular = texture(specularTexture, fTexCoords).rgb;

    vec3 color = min((ambient + diffuse) * texDiffuse + specular * texSpecular, 1.0f);

    fColor = vec4(color, 1.0f);
}